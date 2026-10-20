import type {PoolClient} from 'pg';
import type {RbacEngine} from './rbac-engine.js';
import type {FormulaEvaluationContext} from './flow-formula-runtime.js';
import type {RecordEngine} from './record-engine.js';
import {persistPlatformEvent} from './platform-event-runtime.js';

type FaultConnector={to:number;kind?:string};
type ActionContext={
 client:PoolClient;rbac:RbacEngine;tenantId:string;userId:string;flowApi:string;
 records?:RecordEngine;
 runId:string;
 httpCallout?:(tenantId:string,userId:string,config:Record<string,unknown>,
  variables:Record<string,string|number|boolean|null>,idempotencyKey:string,
  execution?:{client:PoolClient;runId:string;nodeId:number})=>Promise<{status:number;body:string}>;
 enqueueEmail?:(message:{credentialId:string;from:string;recipients:string[];
  subject:string;body:string})=>Promise<void>;
 config:Record<string,unknown>;resolve:(value:unknown)=>unknown;
 variables:Record<string,unknown>;connectors:FaultConnector[];elementId:number;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const scalar=(value:unknown):value is string|number|boolean|null=>
 value===null||typeof value==='string'||typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean';

export async function loadFlowUserResource(client:PoolClient,tenantId:string,userId:string,
 graph:unknown,variables:Record<string,unknown>):Promise<FormulaEvaluationContext> {
 if(typeof graph!=='string'||!(/\$User\.(?:Name|Email|TimeZone)\b/.test(graph)
   ||/\b(?:TODAY|TIMENOW|DAY|MONTH|YEAR|HOUR|MINUTE|SECOND|WEEKDAY|ISOWEEK|ISOYEAR|DATEVALUE|DATETIMEVALUE|TIMEVALUE|ADDMONTHS|TZOFFSET|CURRENCYRATE)\s*\(/i.test(graph)))
  return {};
 const {rows}=await client.query<{
  id:string;email:string;display_name:string;time_zone:string;has_currency_settings:boolean;
  currency_iso_code:string|null;conversion_rate:string|null
 }>(`SELECT u.id,u.email,u.display_name,u.time_zone,s.tenant_id IS NOT NULL AS has_currency_settings,
    currency.value->>'currencyIsoCode' AS currency_iso_code,
    currency.value->>'conversionRate' AS conversion_rate
   FROM md_users u
   LEFT JOIN md_tenant_settings s ON s.tenant_id=u.tenant_id AND s.setting_key='currencies'
   LEFT JOIN LATERAL jsonb_array_elements(
    COALESCE(s.properties->'currencies','{"currencies":[]}'::jsonb)->'currencies'
   ) currency(value) ON true
   WHERE u.tenant_id=$1 AND u.id=$2 AND u.enabled=true`,[tenantId,userId]);
 const actor=rows[0];
 if(!actor)throw new Error('Flow execution user is no longer enabled in this tenant');
 const currencyRates:Record<string,number>={};
 if(!actor.has_currency_settings)currencyRates.USD=1;
 for(const row of rows){
  if(row.currency_iso_code&&row.conversion_rate!==null){
   const rate=Number(row.conversion_rate);
   if(!/^[A-Z]{3}$/.test(row.currency_iso_code)||!Number.isFinite(rate)||rate<=0)
    throw new Error('Invalid tenant currency rate configuration');
   currencyRates[row.currency_iso_code]=rate;
  }
 }
 variables.$User={Id:actor.id,Name:actor.display_name.trim()||actor.email,Email:actor.email,
  TimeZone:actor.time_zone};
 return {timeZone:actor.time_zone,currencyRates};
}

function template(value:unknown,resolve:(value:unknown)=>unknown):string {
 if(typeof value!=='string')throw new Error('Notification values must be text');
 return value.replace(/\{!([A-Za-z_$][A-Za-z0-9_$.]*)\}/g,(_match,reference:string)=>{
  const resolved=resolve('{!'+reference+'}');
  if(resolved!==null&&resolved!==undefined&&!scalar(resolved))
   throw new Error('Notification template references a non-scalar resource');
  return resolved===null||resolved===undefined?'':String(resolved);
 });
}

async function sendCustomNotification(context:ActionContext) {
 const {client,rbac,tenantId,userId,flowApi,config,resolve}=context;
 await rbac.require(tenantId,userId,'Notification','send');
 const recipients=[...new Set(template(config.recipientIds,resolve)
  .split(/[;,\r\n]+/).map(value=>value.trim()).filter(Boolean))];
 const title=template(config.title,resolve),body=template(config.messageBody??'',resolve);
 if(!recipients.length||recipients.length>100||recipients.some(id=>!uuid.test(id))
   ||!title.trim()||title.length>120||body.length>2000)
  throw new Error('Invalid Custom Notification configuration');
 const {rowCount}=await client.query(`
  INSERT INTO md_notifications(tenant_id,recipient_id,title,body,flow_api_name,sent_by)
  SELECT $1,u.id,$3,$4,$5,$6 FROM md_users u
  WHERE u.tenant_id=$1 AND u.enabled=true AND u.id=ANY($2::uuid[])
 `,[tenantId,recipients,title,body,flowApi,userId]);
 if(rowCount!==recipients.length)
  throw new Error('Notification recipients must be enabled users in this tenant');
}

async function createTask(context:ActionContext) {
 const {client,rbac,tenantId,userId,config,resolve}=context;
 const objectApi=config.objectApiName,recordId=template(config.recordId,resolve);
 const subject=template(config.subject,resolve),description=template(config.description??'',resolve);
 const dueAtText=config.dueAt===undefined?'':template(config.dueAt,resolve);
 if(typeof objectApi!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApi)
   ||!uuid.test(recordId)||!subject.trim()||subject.length>200||description.length>10000)
  throw new Error('Invalid Create Task configuration');
 let dueAt:string|null=null;
 if(dueAtText){
  const date=new Date(dueAtText);
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(dueAtText)
    ||!Number.isFinite(date.getTime()))throw new Error('Create Task due date requires an ISO 8601 timezone');
  dueAt=date.toISOString();
 }
 await rbac.require(tenantId,userId,objectApi,'edit');
 await rbac.requireRecord(tenantId,userId,objectApi,recordId,'edit');
 await client.query(`INSERT INTO md_record_activities
  (tenant_id,object_api,record_id,created_by,kind,subject,description,status,due_at)
  VALUES($1,$2,$3,$4,'Task',$5,$6,'Open',$7)`,
 [tenantId,objectApi,recordId,userId,subject.trim(),description,dueAt]);
}

async function postToChatter(context:ActionContext) {
 const {client,rbac,tenantId,userId,config,resolve}=context;
 const objectApi=config.objectApiName,recordId=template(config.recordId,resolve);
 const message=template(config.message,resolve);
 if(typeof objectApi!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApi)
   ||!uuid.test(recordId)||!message.trim()||message.length>10000)
  throw new Error('Invalid Post to Chatter configuration');
 await rbac.require(tenantId,userId,objectApi,'edit');
 await rbac.requireRecord(tenantId,userId,objectApi,recordId,'edit');
 await client.query(`INSERT INTO md_record_chatter_posts
  (tenant_id,object_api,record_id,created_by,body) VALUES($1,$2,$3,$4,$5)`,
 [tenantId,objectApi,recordId,userId,message.trim()]);
}

async function runQuickAction(context:ActionContext) {
 const {client,rbac,tenantId,userId,config,resolve,records}=context;
 const objectApi=config.objectApiName,actionId=config.quickActionId;
 const recordId=template(config.recordId,resolve);
 if(typeof objectApi!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApi)
   ||typeof actionId!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(actionId)
   ||!uuid.test(recordId)||!records)
  throw new Error('Invalid Quick Action configuration');
 await rbac.require(tenantId,userId,'ObjectDefinition','read');
 const {rows}=await client.query<{field_api:string;value_text:string}>(`
  SELECT field_api,value_text FROM md_object_actions
  WHERE tenant_id=$1 AND object_api=$2 AND action_id=$3 AND action_type='Custom'
   AND enabled=true AND behavior='Set Field Value' FOR SHARE
 `,[tenantId,objectApi,actionId]);
 const action=rows[0];
 if(!action)throw new Error('Quick Action is unavailable');
 await records.update(tenantId,userId,objectApi,recordId,{[action.field_api]:action.value_text},undefined,client);
}

async function submitForApproval(context:ActionContext) {
 const {client,rbac,tenantId,userId,flowApi,config,resolve}=context;
 const objectApi=config.objectApiName,recordId=template(config.recordId,resolve);
 const processApi=typeof config.approvalProcessApiName==='string'
  ?config.approvalProcessApiName.trim():'';
 const comments=template(config.comments??'',resolve);
 if(typeof objectApi!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApi)
   ||!uuid.test(recordId)||comments.length>2000||processApi&&!/^[A-Za-z][A-Za-z0-9_]*$/.test(processApi))
  throw new Error('Invalid Submit for Approval configuration');
 let approvers:unknown;
 if(processApi){
  const {rows}=await client.query<{properties:unknown}>(`
   SELECT properties FROM md_system_definitions
   WHERE tenant_id=$1 AND kind='approval-processes' AND api_name=$2 AND enabled=true FOR SHARE
  `,[tenantId,processApi]);
  const properties=rows[0]?.properties;
  if(!properties||typeof properties!=='object'||Array.isArray(properties)
    ||(properties as Record<string,unknown>).active!==true
    ||(properties as Record<string,unknown>).objectApiName!==objectApi)
   throw new Error('Active approval process does not match the target Object');
  approvers=(properties as Record<string,unknown>).approverUserIds;
 }else{
  approvers=typeof config.approverIds==='string'
   ?config.approverIds.split(/[;,\r\n]+/).map(value=>value.trim()).filter(Boolean):[];
 }

 if(!Array.isArray(approvers)||!approvers.length||approvers.length>50
   ||approvers.some(value=>typeof value!=='string'||!uuid.test(value)))
  throw new Error('Approval submission requires 1 to 50 valid approvers');
 const approverIds=[...new Set(approvers as string[])];
 if(!approverIds.length||approverIds.length>50)
  throw new Error('Approval submission requires 1 to 50 distinct approvers');
 const {records}=context;
 if(!records)throw new Error('Flow Record Engine is not configured');
 await rbac.require(tenantId,userId,'ApprovalRequest','manage');
 await rbac.require(tenantId,userId,objectApi,'edit');
 await rbac.requireRecord(tenantId,userId,objectApi,recordId,'edit');
 const locked=await client.query(
  'SELECT id FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3 FOR UPDATE',
  [tenantId,objectApi,recordId]);
 if(!locked.rowCount)throw new Error('Approval target record not found');
 const record=await records.get(tenantId,userId,objectApi,recordId,client);
 const recordName=typeof record.Name==='string'&&record.Name.trim()
  ?record.Name.trim():recordId;
 const object=await client.query<{label:string}>(
  'SELECT label FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2 FOR SHARE',[tenantId,objectApi]);
 if(!object.rows[0])throw new Error('Approval target Object not found');
 const activeUsers=await client.query<{id:string}>(
  'SELECT id FROM md_users WHERE tenant_id=$1 AND enabled=true AND id=ANY($2::uuid[]) FOR SHARE',
  [tenantId,approverIds]);
 if(activeUsers.rowCount!==approverIds.length)
  throw new Error('Approvers must be enabled users in this tenant');
 for(const approverId of approverIds){
  await rbac.require(tenantId,approverId,'ApprovalRequest','approve');
  await rbac.requireRecord(tenantId,approverId,objectApi,recordId,'read');
 }
 const pending=await client.query(
  `SELECT 1 FROM md_approval_requests WHERE tenant_id=$1 AND object_api=$2
   AND record_id=$3 AND status='Pending' LIMIT 1`,[tenantId,objectApi,recordId]);
 if(pending.rowCount)throw new Error('Record already has a pending approval request');
 const group=await client.query<{id:string}>('SELECT gen_random_uuid() AS id');
 const inserted=await client.query(`
  INSERT INTO md_approval_requests
   (tenant_id,group_id,object_api,object_label,record_id,record_name,flow_api_name,
    submitted_by,approver_id,comments)
  SELECT $1,$2,$3,$4,$5,$6,$7,$8,u.id,$9
  FROM md_users u WHERE u.tenant_id=$1 AND u.enabled=true AND u.id=ANY($10::uuid[])
 `,[tenantId,group.rows[0].id,objectApi,object.rows[0].label,recordId,recordName,
   flowApi,userId,comments,approverIds]);
 if(inserted.rowCount!==approverIds.length)
  throw new Error('Approval recipients changed during submission');
 return group.rows[0].id;
}

/** Orchestration stages reuse exactly the same tenant/RBAC/record approval checks. */
export async function submitFlowStageApproval(context:ActionContext):Promise<string> {
 return submitForApproval(context);
}

async function publishPlatformEvent(context:ActionContext) {
 const eventApi=context.config.eventApiName;
 const mappings=context.config.fieldValues;
 if(typeof eventApi!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(eventApi)
   ||!Array.isArray(mappings)||mappings.length>100)
  throw new Error('Invalid Publish Platform Event configuration');
 const values:Record<string,unknown>={};
 for(const mapping of mappings){
  if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))
   throw new Error('Invalid Platform Event field mapping');
  const item=mapping as Record<string,unknown>,field=item.field;
  if(typeof field!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(field)
   ||Object.hasOwn(values,field))throw new Error('Invalid Platform Event field mapping');
  values[field]=template(item.value,context.resolve);
 }
 await persistPlatformEvent(context.client,context.rbac,context.tenantId,context.userId,eventApi,values);
}

async function sendEmail(context:ActionContext) {
 let config=context.config;
 if(config.actionType==='Email Alert'){
  const alertApi=config.emailAlertId;
  if(typeof alertApi!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(alertApi))
   throw new Error('Email Alert requires a valid saved alert');
  const {rows}=await context.client.query<{
   object_api:string;credential_id:string;from_email:string;recipients:string;
   subject:string;body:string
  }>(`
   SELECT a.object_api,a.credential_id,a.from_email,a.recipients,a.subject,a.body
   FROM md_email_alert_details a
   JOIN md_system_definitions d ON d.tenant_id=a.tenant_id
    AND d.kind='email-alerts' AND d.api_name=a.alert_api_name AND d.enabled=true
   WHERE a.tenant_id=$1 AND a.alert_api_name=$2 FOR SHARE OF a,d`,
   [context.tenantId,alertApi]);
  const alert=rows[0];
  if(!alert)throw new Error('Email Alert is unavailable');
  const record=await context.client.query<{object_api:string}>(`
   SELECT object_api FROM md_flow_interview_records
   WHERE tenant_id=$1 AND run_id=$2 AND api_name='$Record' AND sort_order=0`,
   [context.tenantId,context.runId]);
  if(!record.rows[0]||alert.object_api!==record.rows[0].object_api)
   throw new Error('Email Alert does not match the triggering record');
  config={namedCredentialId:alert.credential_id,fromEmail:alert.from_email,
   recipients:alert.recipients,subject:alert.subject,body:alert.body};
 }
 if(typeof context.enqueueEmail!=='function')
  throw new Error('Flow email queue is not configured');
 const credentialId=config.namedCredentialId;
 const from=template(config.fromEmail,context.resolve).trim();
 const recipients=[...new Set(template(config.recipients,context.resolve)
  .split(/[;,\r\n]+/).map(value=>value.trim()).filter(Boolean))];
 const subject=template(config.subject,context.resolve);
 const body=template(config.body,context.resolve);
 const email=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
 if(typeof credentialId!=='string'||!uuid.test(credentialId)||!email.test(from)
  ||from.length>254||!recipients.length||recipients.length>100
  ||recipients.some(value=>value.length>254||!email.test(value))
  ||!subject.trim()||subject.length>300||/[\r\n]/.test(subject)||body.length>10000)
  throw new Error('Invalid Flow email configuration');
 await context.enqueueEmail({credentialId,from,recipients,subject,body});
}

async function runExternalServiceAction(context:ActionContext){
 const serviceApi=context.config.externalServiceApiName;
 const operationApi=context.config.externalOperationApiName;
 const credentialId=context.config.namedCredentialId;
 if(typeof serviceApi!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(serviceApi)
  ||typeof operationApi!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(operationApi)
  ||typeof credentialId!=='string'||!uuid.test(credentialId))
  throw new Error('External Service Action configuration is invalid');
 const {rows}=await context.client.query<{
  http_method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE';path_template:string;
  parameter_name:string;parameter_location:'path'|'query'|'body';required:boolean
  ;server_origin:string;server_path:string;base_url:string|null
 }>(`SELECT o.http_method,o.path_template,p.parameter_name,p.parameter_location,p.required
    ,s.server_origin,s.server_path,c.base_url
    FROM md_external_service_operations o
    JOIN md_external_services s ON s.tenant_id=o.tenant_id AND s.api_name=o.service_api
    LEFT JOIN md_named_credentials c ON c.tenant_id=o.tenant_id AND c.id=$4
     AND c.protocol='HTTPS' AND c.enabled=true
    LEFT JOIN md_external_service_parameters p ON p.tenant_id=o.tenant_id
     AND p.service_api=o.service_api AND p.operation_api=o.operation_api
    WHERE o.tenant_id=$1 AND o.service_api=$2 AND o.operation_api=$3
    ORDER BY p.parameter_location,p.parameter_name`,
  [context.tenantId,serviceApi,operationApi,credentialId]);
 if(!rows.length)throw new Error('External Service operation is unavailable');
 const operation=rows[0];
 if(!operation.base_url)throw new Error('External Service HTTPS Named Credential is unavailable');
 let credentialUrl:URL;
 try{credentialUrl=new URL(operation.base_url);}catch{throw new Error('External Service Named Credential URL is invalid');}
 if(credentialUrl.protocol!=='https:'||credentialUrl.origin!==operation.server_origin
  ||credentialUrl.pathname!=='/'||credentialUrl.search||credentialUrl.hash
  ||credentialUrl.username||credentialUrl.password)
  throw new Error('External Service Named Credential origin does not match the imported API');
 const inputs=context.config.externalInputs;
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))
  throw new Error('External Service input mappings are invalid');
 const inputMap=inputs as Record<string,unknown>;
 const resolveInput=(name:string,required:boolean):unknown=>{
  const value=inputMap[name];
  if(value===undefined||value===null||value===''){
   if(required)throw new Error('External Service input is required: '+name);
   return undefined;
  }
  if(typeof value!=='string')throw new Error('External Service inputs must be text or Flow references');
  return context.resolve(value);
 };
 let path=[operation.server_path,operation.path_template].filter(Boolean).join('/');
 const query=new URLSearchParams();
 let body='';
 for(const parameter of rows){
  if(!parameter.parameter_name)continue;
  const value=resolveInput(parameter.parameter_name,parameter.required);
  if(parameter.parameter_location==='path'){
   if(value===undefined)throw new Error('External Service path input is required');
   path=path.replace('{'+parameter.parameter_name+'}',encodeURIComponent(String(value)));
  }else if(parameter.parameter_location==='query'&&value!==undefined){
   query.append(parameter.parameter_name,String(value));
  }else if(parameter.parameter_location==='body'&&value!==undefined){
   if(typeof value!=='string')throw new Error('External Service JSON body must be configured as JSON text');
   let parsed:unknown;
   try{parsed=JSON.parse(value);}catch{throw new Error('External Service request body must be valid JSON');}
   const resolveBody=(item:unknown):unknown=>{
    if(Array.isArray(item))return item.map(resolveBody);
    if(item&&typeof item==='object'){
     return Object.fromEntries(Object.entries(item).map(([key,nested])=>[key,resolveBody(nested)]));
    }
    if(typeof item==='string'&&(/^\{![A-Za-z_$][A-Za-z0-9_$.]*\}$/.test(item)
      ||/^@[A-Za-z_$][A-Za-z0-9_$.]*$/.test(item)))return context.resolve(item);
    return item;
   };
   const resolved=resolveBody(parsed);
   if(!resolved||typeof resolved!=='object'||Array.isArray(resolved))
    throw new Error('External Service request body must be a JSON object');
   body=JSON.stringify(resolved);
  }
 }
 if(path.includes('{')||path.includes('}')||path.startsWith('/')||path.includes('\\')
  ||path.split('/').some(segment=>segment==='..'||segment==='.')
  ||path.length>1800)throw new Error('External Service path parameters are incomplete or unsafe');
 if(query.size)path+='?'+query.toString();
 if(path.length>2048||Buffer.byteLength(body)>32768)
  throw new Error('External Service request exceeds the callout size limit');
 if(!context.httpCallout)throw new Error('External Service callout transport is unavailable');
 const variables=Object.fromEntries(Object.entries(context.variables).filter(
  (entry):entry is [string,string|number|boolean|null]=>
   entry[1]===null||typeof entry[1]==='string'||typeof entry[1]==='boolean'
    ||typeof entry[1]==='number'&&Number.isFinite(entry[1])));
 await context.httpCallout(context.tenantId,context.userId,{
  namedCredentialId:credentialId,method:operation.http_method,path,
  headers:body?'Content-Type: application/json':'',
  ...(body?{body}:{}),maxAttempts:5,idempotencyKey:context.runId+'-'+context.elementId
 },variables,context.runId+'-'+context.elementId,{
  client:context.client,runId:context.runId,nodeId:context.elementId
 });
}

/** SQL-backed actions join the Flow transaction and can be rolled back on fault. */
export async function executeFlowAction(context:ActionContext):Promise<number|undefined> {
 const savepoint='flow_action_'+context.elementId;
 await context.client.query('SAVEPOINT '+savepoint);
 try {
  if(context.config.actionType==='Custom Notification')await sendCustomNotification(context);
  else if(context.config.actionType==='Create Task')await createTask(context);
  else if(context.config.actionType==='Post to Chatter')await postToChatter(context);
  else if(context.config.actionType==='Quick Actions')await runQuickAction(context);
  else if(context.config.actionType==='Submit for Approval')await submitForApproval(context);
  else if(context.config.actionType==='Publish Platform Event')await publishPlatformEvent(context);
  else if(context.config.actionType==='Send Email'||context.config.actionType==='Email Alert')
   await sendEmail(context);
  else if(context.config.actionType==='External Service Action')
   await runExternalServiceAction(context);
  else throw new Error('Unsupported Flow action: '+String(context.config.actionType??''));
  await context.client.query('RELEASE SAVEPOINT '+savepoint);
  return undefined;
 }catch(error){
  await context.client.query('ROLLBACK TO SAVEPOINT '+savepoint);
  await context.client.query('RELEASE SAVEPOINT '+savepoint);
  const fault=context.connectors.find(connector=>connector.kind==='fault');
  if(!fault)throw error;
  context.variables['$Flow.FaultMessage']=error instanceof Error?error.message:'Unknown Flow error';
  context.variables['$Flow.FaultCode']=error instanceof Error?error.name:'UNKNOWN';
  return fault.to;
 }
}
