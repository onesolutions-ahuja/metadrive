import type {RbacEngine} from './rbac-engine.js';
import type {SqlExecutor,SqlPersistence} from './sql-persistence.js';
import {validateFlowResources} from './flow-formula-runtime.js';
import {resolveFlowLocalDateTime,resolveFlowWaitUntil} from './flow-wait-runtime.js';
import type {FlowCapabilityCatalog} from './flow-capability-catalog.js';

export async function flowAppIsEntitled(db:SqlExecutor,tenantId:string,appApiName:string|null) {
 if(appApiName===null)return true;
 if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(appApiName))return false;
 const {rows}=await db.query(`
  SELECT 1 FROM md_apps a
  JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=$1
  JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=$1
  WHERE a.api_name=$2 AND a.enabled=true AND e.active=true
   AND (e.expires_at IS NULL OR e.expires_at>now())
   AND (a.tenant_owner_id IS NULL OR a.tenant_owner_id=$1)`,
  [tenantId,appApiName]);
 return rows.length>0;
}

export async function validateFlowDraft(rbac:RbacEngine|undefined,tenantId:string,userId:string,
  apiName:string,draft:unknown,db?:SqlPersistence,capabilities:FlowCapabilityCatalog|null=null) {
 if(!rbac)throw new Error('Flow permissions not configured');
 await rbac.require(tenantId,userId,'FlowDefinition','manage');
 if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName))throw new Error('Invalid Flow name');
 if(!draft||typeof draft!=='object'||Array.isArray(draft))throw new Error('Invalid Flow draft');
 const data=draft as Record<string,unknown>;
 const errors:string[]=[],warnings:string[]=[];
 if(data.appApiName!==undefined&&data.appApiName!==null
  &&(typeof data.appApiName!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(data.appApiName)))
  errors.push('Flow app identity is invalid');
 const decisionOperators=new Set([
  'equals','notequals','greaterthan','greaterthanorequalto','lessthan','lessthanorequalto',
  'isnull','isnotnull','contains','startswith','endswith','doesnotcontain','notcontains','ischanged','wasset'
 ]);
 const normalizeOperator=(value:unknown)=>String(value??'Equals').trim().toLowerCase().replace(/[\s_-]+/g,'');
 const validConditionList=(value:unknown,recordTrigger:boolean,location:string,
  fieldPattern?:RegExp)=>{
  if(value===undefined)return;
  if(!Array.isArray(value)||value.length>50){errors.push(location+' must contain at most 50 conditions');return;}
  for(const raw of value){
   if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    errors.push(location+' contains an invalid condition');continue;
   }
   const condition=raw as Record<string,unknown>,operator=normalizeOperator(condition.operator);
   if(!decisionOperators.has(operator)){errors.push(location+' contains an unsupported operator');continue;}
   if(typeof condition.field!=='string'||!condition.field.trim())
    errors.push(location+' conditions require a field or resource');
   else if(fieldPattern&&!fieldPattern.test(condition.field))
    errors.push(location+' conditions require a valid record field');
   if(['ischanged','wasset'].includes(operator)){
    if(!recordTrigger)errors.push(operator==='ischanged'
     ?'Is Changed is supported only in Record-Triggered Flows'
     :'Was Set is supported only in Record-Triggered Flows');
    if(condition.value!==undefined&&condition.value!=='')
     errors.push(operator==='ischanged'?'Is Changed does not accept a comparison value'
      :'Was Set does not accept a comparison value');
   }else if(!['isnull','isnotnull'].includes(operator)
     &&!Object.hasOwn(condition,'value'))
    errors.push(location+' comparison requires a value');
  }
 };
 const startNode=Array.isArray(data.elements)
  ?data.elements.find(item=>item&&typeof item==='object'&&!Array.isArray(item)
    &&(item as Record<string,unknown>).type==='Start') as Record<string,unknown>|undefined
  :undefined;
 const startConfig=startNode?.config&&typeof startNode.config==='object'
  &&!Array.isArray(startNode.config)?startNode.config as Record<string,unknown>:{};
 const beforeSave=data.flowType==='Record-Triggered Flow'&&startConfig.runWhen==='before-save';
 const catalogType=capabilities?.flowTypes.find(type=>type.type===data.flowType);
 const executionContext=startConfig.executionContext??'User';
 if(!['User','System'].includes(String(executionContext)))
  errors.push('Flow execution context must be User or System');
 if(executionContext==='System'&&(data.flowType==='Screen Flow'||beforeSave))
  errors.push('System execution context is not supported for Screen or before-save Record-Triggered Flows');
 if(data.apiName!==apiName)errors.push('Flow API name must match the requested definition');
 if(capabilities?!catalogType?.validateEnabled:!['Autolaunched Flow','Screen Flow',
  'Record-Triggered Flow','Schedule-Triggered Flow','Platform Event-Triggered Flow'].includes(String(data.flowType)))
 errors.push('This SQL runtime supports Autolaunched Flow, Screen Flow, supported Record-Triggered Flows, durable Schedule-Triggered Flows, and Platform Event-Triggered Flows');
 errors.push(...validateFlowResources(data.resources,data.flowType==='Record-Triggered Flow'));
 if(!Array.isArray(data.elements)||!Array.isArray(data.connectors))
  return {valid:false,errors:['Flow must contain elements and connectors'],warnings};
 const nodes=data.elements as unknown[],links=data.connectors as unknown[];
 if(nodes.length>250||links.length>500)errors.push('Flow graph exceeds allowed size');
 const ids=new Set<number>(),types=new Map<number,string>();
 for(const item of nodes){
  if(!item||typeof item!=='object'||Array.isArray(item)){errors.push('Invalid Flow element');continue;}
  const node=item as Record<string,unknown>;
  if(typeof node.id!=='number'||!Number.isSafeInteger(node.id)||ids.has(node.id)){
   errors.push('Flow element identifiers must be unique integers');continue;
  }
  ids.add(node.id);
  const type=String(node.type??'');
  types.set(node.id,type);
  const capability=capabilities?.elements.find(item=>item.type===type);
  // Without a SQL connection, isolated validator unit tests retain the legacy contract.
  // Production activate/validate always passes db and fails closed against SQL capabilities.
  const legacyElementAllowed=['Start','Assignment','Decision','Create Records','CreateRecord',
    'HTTP Callout','Action','End','Get Records','Update Records','Delete Records','Loop',
    'Collection Filter','Collection Sort','Transform','Subflow','Wait','Roll Back Records',
    'Custom Error','Publish Platform Event',
    ...(data.flowType==='Screen Flow'?['Screen']:[])].includes(type);
  if(capabilities?!capability?.allowedFlowTypes.includes(String(data.flowType)):!legacyElementAllowed)
   errors.push('Unsupported SQL Flow element: '+type);
  if(beforeSave&&!(capabilities?capability?.beforeSaveAllowed:
    ['Start','Assignment','Decision','Custom Error','End'].includes(type)))
   errors.push('Before-save Record-Triggered Flows support only Assignment and Decision elements');
  if(type==='Wait'&&beforeSave)
   errors.push('Wait elements are not supported in before-save Record-Triggered Flows');
  const config=node.config;
  if(!config||typeof config!=='object'||Array.isArray(config)){
   errors.push('Flow element needs a configuration object: '+node.id);
   continue;
  }
  const properties=config as Record<string,unknown>;
  if(type==='Assignment'){
   const variable=String(properties.variable??'');
   const target=/^\$Record\.([A-Za-z][A-Za-z0-9_]*)$/.exec(variable);
   if(variable.startsWith('$Record.')&&(!beforeSave||!target))
    errors.push('Assignments to $Record fields require a valid before-save Record-Triggered Flow target');
   if(target&&properties.operator!==undefined&&properties.operator!=='Assign')
    errors.push('Before-save $Record assignments support only the Assign operator');
  }
  if(type==='Custom Error'){
   if(data.flowType!=='Record-Triggered Flow')
    errors.push('Custom Error is supported only in Record-Triggered Flows');
   if(typeof properties.errorMessage!=='string'||!properties.errorMessage.trim()
     ||properties.errorMessage.length>1000)
    errors.push('Custom Error requires a message of at most 1000 characters');
   if(!['Page','Field'].includes(String(properties.errorLocation??'Page')))
    errors.push('Custom Error location must be Page or Field');
   if(properties.errorLocation==='Field'){
    const field=properties.fieldName;
    if(typeof field!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(field))
     errors.push('Field-level Custom Error requires a valid field');
    else if(startConfig.trigger==='deleted')
     errors.push('Field-level Custom Error cannot be used for delete triggers');
    else if(!db)
     errors.push('Field-level Custom Error requires metadata validation');
    else{
     const {rows}=await db.query(`
      SELECT 1 FROM md_field_definitions
      WHERE tenant_id=$1 AND object_api=$2 AND api_name=$3 AND deleted_at IS NULL`,
      [tenantId,startConfig.object,field]);
     if(!rows.length)errors.push('Field-level Custom Error references an unavailable field');
    }
   }
  }
  if(type==='Start'&&data.flowType==='Record-Triggered Flow'){
   if(typeof properties.object!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.object))
    errors.push('Record-Triggered Flow Start requires a valid Object');
   if(!['created','updated','created-or-updated','deleted'].includes(String(properties.trigger??'created-or-updated')))
    errors.push('Record-Triggered Flow trigger is invalid');
   if(properties.runWhen!=='after-save')
    if(properties.runWhen!=='before-save')
     errors.push('Record-Triggered Flow save phase is invalid');
   if(properties.runWhen==='before-save'&&properties.trigger==='deleted')
    errors.push('Before-save Record-Triggered Flows cannot run on record deletion');
   if(properties.updatedRecordBehavior!==undefined
     &&!['every-time','transition'].includes(String(properties.updatedRecordBehavior)))
    errors.push('Record-Triggered Flow update behavior is invalid');
   if(properties.entryConditions!==undefined
     &&(!Array.isArray(properties.entryConditions)||properties.entryConditions.length>50))
    errors.push('Record-Triggered Flow supports up to 50 entry conditions');
   if(properties.triggerOrder!==undefined
     &&(!Number.isSafeInteger(Number(properties.triggerOrder))
       ||Number(properties.triggerOrder)<1||Number(properties.triggerOrder)>2000))
    errors.push('Record-Triggered Flow order must be between 1 and 2000');
   validConditionList(properties.entryConditions,true,'Record-Triggered Flow entry conditions',
    /^[A-Za-z][A-Za-z0-9_]*$/);
  }
  if(type==='Start'&&data.flowType==='Schedule-Triggered Flow'){
   if(typeof properties.object!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.object))
   errors.push('Schedule-Triggered Flow Start requires a valid Object');
   if(typeof properties.startDate!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(properties.startDate))
   errors.push('Schedule-Triggered Flow requires a start date');
   if(typeof properties.startTime!=='string'||! /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(properties.startTime))
   errors.push('Schedule-Triggered Flow requires a valid local start time');
   if(typeof properties.timeZone!=='string'||properties.timeZone.length>100)
   errors.push('Schedule-Triggered Flow requires an IANA time zone');
   else try{new Intl.DateTimeFormat('en-US',{timeZone:properties.timeZone});}
   catch{errors.push('Schedule-Triggered Flow time zone is invalid');}
   if(typeof properties.startDate==='string'&&typeof properties.startTime==='string'
     &&typeof properties.timeZone==='string'){
    try{resolveFlowLocalDateTime(properties.startDate,properties.startTime,properties.timeZone);}
    catch{errors.push('Schedule-Triggered Flow local start date and time are invalid');}
   }
   if(!['Once','Daily','Weekly','Monthly'].includes(String(properties.frequency)))
   errors.push('Schedule-Triggered Flow frequency must be Once, Daily, Weekly or Monthly');
   validConditionList(properties.entryConditions,false,'Schedule-Triggered Flow entry conditions',
   /^[A-Za-z][A-Za-z0-9_]*$/);
  }
  if(type==='Start'&&data.flowType==='Platform Event-Triggered Flow'){
   if(typeof properties.object!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.object))
    errors.push('Platform Event-Triggered Flow Start requires a valid event');
   validConditionList(properties.entryConditions,false,'Platform Event entry conditions',
    /^[A-Za-z][A-Za-z0-9_]*$/);
   if(typeof properties.object==='string'&&/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.object)){
    await rbac.require(tenantId,userId,'SystemDefinition:platform-events','read');
    if(db){
     const {rows:events}=await db.query<{api_name:string;field_api:string|null}>(`
      SELECT event.api_name,field.field_api FROM md_system_definitions AS event
      LEFT JOIN md_platform_event_fields AS field
       ON field.tenant_id=event.tenant_id AND field.event_api_name=event.api_name
      WHERE event.tenant_id=$1 AND event.kind='platform-events'
       AND event.api_name=$2 AND event.enabled=true
      ORDER BY field.sort_order,field.field_api`,
      [tenantId,properties.object]);
     const fieldNames=new Set(events.map(event=>event.field_api)
      .filter((name):name is string=>typeof name==='string'));
     if(!events.length)errors.push('Platform Event-Triggered Flow references an unavailable event');
     for(const condition of Array.isArray(properties.entryConditions)?properties.entryConditions:[]){
      const field=condition&&typeof condition==='object'&&!Array.isArray(condition)
       ?String((condition as Record<string,unknown>).field??''):'';
      if(field&&!fieldNames.has(field))errors.push('Platform Event entry condition references an unknown field');
     }
    }
   }
  }
  if(['Get Records','Update Records','Delete Records','Create Records','CreateRecord'].includes(type)
    &&(typeof properties.object!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.object)))
   errors.push(type+' requires a valid Object API name');
  if(['Update Records','Delete Records'].includes(type)){
   if(typeof properties.object!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.object))
    errors.push(type+' requires a valid Object API name');
   const source=String(properties.recordSource??(properties.recordId?'id':'filter'));
   if(!['id','record','collection','filter'].includes(source))
    errors.push(type+' record source is invalid');
   if(source==='id'&&(typeof properties.recordId!=='string'||!properties.recordId.trim()))
    errors.push(type+' requires a record ID or Flow resource reference');
   if(source==='record'&&(typeof properties.recordVariable!=='string'
      ||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.recordVariable)))
    errors.push(type+' requires a valid record variable');
   if(source==='collection'&&(typeof properties.collection!=='string'
      ||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.collection)))
    errors.push(type+' requires a valid record collection');
   if(source==='filter'&&(!Array.isArray(properties.conditions)||properties.conditions.length===0
      ||properties.conditions.length>50))
    errors.push(type+' filter requires between 1 and 50 conditions');
   if(source==='filter'&&Array.isArray(properties.conditions))
    for(const condition of properties.conditions){
     const field=condition&&typeof condition==='object'&&!Array.isArray(condition)
      ?String((condition as Record<string,unknown>).field??''):'';
     if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(field))
      errors.push(type+' filter conditions require valid field API names');
    }
   if(type==='Update Records'){
    if(!Array.isArray(properties.fieldValues)||!properties.fieldValues.length)
     errors.push('Update Records requires field assignments');
    else for(const entry of properties.fieldValues){
     const field=entry&&typeof entry==='object'&&!Array.isArray(entry)
      ?String((entry as Record<string,unknown>).field??(entry as Record<string,unknown>).apiName??''):'';
     if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(field))
      errors.push('Update Records field assignment must use a valid API name');
    }
   }
   if(type==='Create Records'||type==='CreateRecord'){
    if(properties.recordSource==='collection'){
     if(typeof properties.collection!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.collection))
      errors.push('Create Records requires a valid input collection');
     if(properties.resultVariable!==undefined
       &&(typeof properties.resultVariable!=='string'
         ||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.resultVariable)))
      errors.push('Create Records output collection must use a valid resource name');
    }else if(properties.recordSource!==undefined&&properties.recordSource!=='fields')
     errors.push('Create Records record source is invalid');
    else if(!Array.isArray(properties.fieldValues)||!properties.fieldValues.length)
     errors.push('Create Records requires field assignments');
    else for(const entry of properties.fieldValues){
     const field=entry&&typeof entry==='object'&&!Array.isArray(entry)
      ?String((entry as Record<string,unknown>).field??(entry as Record<string,unknown>).apiName??''):'';
     if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(field))
      errors.push('Create Records field assignment must use a valid API name');
    }
   }
  }
  if(type==='Get Records'){
   if(properties.recordLimit!==undefined&&properties.recordLimit!=='all'
     &&(!Number.isSafeInteger(Number(properties.recordLimit))
       ||Number(properties.recordLimit)<1||Number(properties.recordLimit)>200))
    errors.push('Get Records limit must be between 1 and 200');
   if(properties.conditions!==undefined
     &&(!Array.isArray(properties.conditions)||properties.conditions.length>50))
    errors.push('Get Records supports up to 50 filter conditions');
   if(Array.isArray(properties.conditions))for(const condition of properties.conditions){
    const field=condition&&typeof condition==='object'&&!Array.isArray(condition)
     ?String((condition as Record<string,unknown>).field??''):'';
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(field))
     errors.push('Get Records conditions require valid field API names');
   }
   if(properties.fields!==undefined&&properties.fields!=='all'
     &&(!Array.isArray(properties.fields)||properties.fields.some(field=>
       typeof field!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(field))))
    errors.push('Get Records fields must be "all" or valid field API names');
   if(properties.outputVariable!==undefined&&properties.outputVariable!==''
     &&(typeof properties.outputVariable!=='string'
       ||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.outputVariable)))
    errors.push('Get Records output must use a valid resource name');
   if(properties.sortField!==undefined&&properties.sortField!==''
     &&(typeof properties.sortField!=='string'
       ||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.sortField)))
    errors.push('Get Records sort field must be a valid field API name');
   if(properties.sortOrder!==undefined&&!['Ascending','Descending','asc','desc'].includes(String(properties.sortOrder)))
    errors.push('Get Records sort order is invalid');
  }
  if(type==='Loop'){
   if(typeof properties.collection!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.collection))
    errors.push('Loop requires a valid record collection');
   if(typeof properties.loopVariable!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.loopVariable))
    errors.push('Loop requires a valid loop variable');
   if(properties.direction!==undefined&&!['First to last','Last to first'].includes(String(properties.direction)))
    errors.push('Loop direction is invalid');
  }
  if(['Collection Filter','Collection Sort','Transform'].includes(type)){
   for(const key of ['collection','outputCollection'])
    if(typeof properties[key]!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties[key]))
     errors.push(type+' requires a valid '+(key==='collection'?'input':'output')+' collection');
   if(type==='Collection Filter'){
    if(!Array.isArray(properties.conditions)||properties.conditions.length<1||properties.conditions.length>50)
     errors.push('Collection Filter requires between 1 and 50 conditions');
    if(Array.isArray(properties.conditions))for(const condition of properties.conditions){
     const field=condition&&typeof condition==='object'&&!Array.isArray(condition)
      ?String((condition as Record<string,unknown>).field??''):'';
     if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(field))
      errors.push('Collection Filter conditions require valid field API names');
    }
   }else if(type==='Collection Sort'){
    if(typeof properties.sortField!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.sortField))
     errors.push('Collection Sort requires a valid sort field');
    if(properties.sortOrder!==undefined&&!['Ascending','Descending'].includes(String(properties.sortOrder)))
     errors.push('Collection Sort direction is invalid');
   }else if(!Array.isArray(properties.mappings)||properties.mappings.length<1||properties.mappings.length>100)
    errors.push('Transform requires between 1 and 100 field mappings');
   else for(const mapping of properties.mappings){
    const source=mapping&&typeof mapping==='object'&&!Array.isArray(mapping)
     ?String((mapping as Record<string,unknown>).sourceField??''):'';
    const target=mapping&&typeof mapping==='object'&&!Array.isArray(mapping)
     ?String((mapping as Record<string,unknown>).targetField??''):'';
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(source)||!/^[A-Za-z][A-Za-z0-9_]*$/.test(target))
     errors.push('Transform mappings require valid source and target field API names');
   }
  }
  if(type==='HTTP Callout'){
   if(typeof properties.namedCredentialId!=='string'
     ||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(properties.namedCredentialId))
    errors.push('HTTP Callout requires a tenant HTTPS Named Credential');
   if(properties.integrationConnectionId||properties.integrationConnectionResource
     ||properties.namedCredentialResource)
    errors.push('HTTP Callout dynamic provider bindings are not yet supported');
   if(!['GET','POST','PUT','PATCH','DELETE'].includes(String(properties.method??'GET')))
    errors.push('HTTP Callout method is not supported');
   if(typeof properties.path!=='string'||properties.path.startsWith('/')
     ||properties.path.includes('\\')||properties.path.length>2048)
    errors.push('HTTP Callout needs a safe relative path');
   if(properties.deliveryMode==='DURABLE_ASYNC'&&(properties.statusVariable
     ||properties.responseVariable||properties.responseMapping))
    errors.push('Durable async HTTP Callout cannot return response variables');
   if(properties.deliveryMode!==undefined
     &&!['SYNC','DURABLE_ASYNC'].includes(String(properties.deliveryMode)))
    errors.push('HTTP Callout delivery mode is invalid');
   if(properties.queryParameters)errors.push('HTTP Callout structured query mapping is not supported');
   if(!['FAULT_PATH','FAIL','CONTINUE'].includes(String(properties.onError??'FAIL')))
    errors.push('HTTP Callout error policy is invalid');
  }
  if(type==='Action'){
   if(data.flowType==='Record-Triggered Flow'&&beforeSave)
    errors.push('Before-save Record-Triggered Flows cannot execute Actions');
   if(properties.actionType==='Create Task'){
    if(typeof properties.objectApiName!=='string'
      ||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.objectApiName))
     errors.push('Create Task requires a valid target Object');
    if(typeof properties.recordId!=='string'||!properties.recordId.trim()
      ||properties.recordId.length>512)
     errors.push('Create Task requires a target record ID or resource');
    if(typeof properties.subject!=='string'||!properties.subject.trim()
      ||properties.subject.length>200)
     errors.push('Create Task requires a subject of at most 200 characters');
    if(properties.description!==undefined
      &&(typeof properties.description!=='string'||properties.description.length>10000))
     errors.push('Create Task description must be at most 10000 characters');
    if(properties.dueAt!==undefined
      &&(typeof properties.dueAt!=='string'||properties.dueAt.length>128))
     errors.push('Create Task due date must be text or a resource reference');
   }else if(properties.actionType==='Send Email'){
    if(typeof properties.namedCredentialId!=='string'
      ||!/^[0-9a-f-]{36}$/i.test(properties.namedCredentialId))
     errors.push('Send Email requires an SMTP Named Credential');
    if(typeof properties.fromEmail!=='string'||!properties.fromEmail.trim()
      ||properties.fromEmail.length>512)
     errors.push('Send Email requires a From email address or resource');
    if(typeof properties.recipients!=='string'||!properties.recipients.trim()
      ||properties.recipients.length>4096)
     errors.push('Send Email requires at least one recipient or resource');
    if(typeof properties.subject!=='string'||!properties.subject.trim()
      ||properties.subject.length>300)
     errors.push('Send Email requires a subject of at most 300 characters');
    if(typeof properties.body!=='string'||properties.body.length>10000)
     errors.push('Send Email body must be text of at most 10000 characters');
    if(typeof properties.namedCredentialId==='string'
      &&/^[0-9a-f-]{36}$/i.test(properties.namedCredentialId)&&db){
     await rbac.require(tenantId,userId,'NamedCredential','read');
     await rbac.require(tenantId,userId,'Email','send');
     const {rows}=await db.query(`
      SELECT 1 FROM md_named_credentials
      WHERE tenant_id=$1 AND id=$2 AND protocol='SMTP' AND enabled=true`,
      [tenantId,properties.namedCredentialId]);
     if(!rows.length)errors.push('Send Email SMTP credential is unavailable');
    }
   }else if(properties.actionType==='Email Alert'){
    if(data.flowType!=='Record-Triggered Flow')
     errors.push('Email Alerts are supported only in Record-Triggered Flows');
    if(typeof properties.emailAlertId!=='string'
      ||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.emailAlertId))
     errors.push('Email Alert requires a valid saved alert');
    if(typeof properties.emailAlertId==='string'
      &&/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.emailAlertId)&&db){
     await rbac.require(tenantId,userId,'SystemDefinition:email-alerts','read');
     await rbac.require(tenantId,userId,'NamedCredential','read');
     await rbac.require(tenantId,userId,'Email','send');
     const {rows}=await db.query<{object_api:string;credential_id:string}>(`
      SELECT a.object_api,a.credential_id FROM md_email_alert_details a
      JOIN md_system_definitions d ON d.tenant_id=a.tenant_id
       AND d.kind='email-alerts' AND d.api_name=a.alert_api_name AND d.enabled=true
      WHERE a.tenant_id=$1 AND a.alert_api_name=$2`,
      [tenantId,properties.emailAlertId]);
     const alert=rows[0];
     if(!alert||alert.object_api!==startConfig.object)
      errors.push('Email Alert is unavailable or does not match the trigger Object');
     if(!alert||!/^[0-9a-f-]{36}$/i.test(alert.credential_id))
      errors.push('Email Alert SMTP credential is invalid');
     else{
      const {rows:credentials}=await db.query(`
       SELECT 1 FROM md_named_credentials
       WHERE tenant_id=$1 AND id=$2 AND protocol='SMTP' AND enabled=true`,
       [tenantId,alert.credential_id]);
      if(!credentials.length)errors.push('Email Alert SMTP credential is unavailable');
     }
    }
   }else if(properties.actionType==='Post to Chatter'){
    if(typeof properties.objectApiName!=='string'
      ||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.objectApiName))
     errors.push('Post to Chatter requires a valid target Object');
    if(typeof properties.recordId!=='string'||!properties.recordId.trim()
      ||properties.recordId.length>512)
     errors.push('Post to Chatter requires a target record ID or resource');
    if(typeof properties.message!=='string'||!properties.message.trim()
      ||properties.message.length>10000)
     errors.push('Post to Chatter requires a message of at most 10000 characters');
    }else if(properties.actionType==='Quick Actions'){
     const objectApiName=properties.objectApiName,actionId=properties.quickActionId;
     if(typeof objectApiName!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApiName))
      errors.push('Quick Actions requires a valid target Object');
     if(typeof actionId!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(actionId))
      errors.push('Quick Actions requires a configured object action');
     if(typeof properties.recordId!=='string'||!properties.recordId.trim()
       ||properties.recordId.length>512)
      errors.push('Quick Actions requires a target record ID or resource');
     if(db&&typeof objectApiName==='string'&&/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApiName)
       &&typeof actionId==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(actionId)){
      await rbac.require(tenantId,userId,'ObjectDefinition','read');
      await rbac.require(tenantId,userId,objectApiName,'read');
      const {rows}=await db.query(`
       SELECT 1 FROM md_object_actions
       WHERE tenant_id=$1 AND object_api=$2 AND action_id=$3 AND action_type='Custom'
        AND enabled=true AND behavior='Set Field Value'`,
       [tenantId,objectApiName,actionId]);
      if(!rows.length)errors.push('Quick Action is unavailable or unsupported');
     }
    }else if(properties.actionType==='Submit for Approval'){
     if(typeof properties.objectApiName!=='string'
       ||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.objectApiName))
      errors.push('Submit for Approval requires a valid target Object');
     if(typeof properties.recordId!=='string'||!properties.recordId.trim()
       ||properties.recordId.length>512)
      errors.push('Submit for Approval requires a target record ID or resource');
     if(properties.approvalProcessApiName!==undefined
       &&(typeof properties.approvalProcessApiName!=='string'
        ||! /^[A-Za-z][A-Za-z0-9_]*$/.test(properties.approvalProcessApiName)))
      errors.push('Approval Process API name is invalid');
     if(!(typeof properties.approvalProcessApiName==='string'
       &&properties.approvalProcessApiName.trim())
       &&(typeof properties.approverIds!=='string'||!properties.approverIds.trim()
        ||properties.approverIds.length>4096))
      errors.push('Submit for Approval requires an active process or approver IDs');
     if(properties.comments!==undefined
       &&(typeof properties.comments!=='string'||properties.comments.length>2000))
      errors.push('Approval comments must be at most 2000 characters');
    }else if(properties.actionType==='Custom Notification'){
    if(typeof properties.recipientIds!=='string'||!properties.recipientIds.trim()
      ||properties.recipientIds.length>4096)
     errors.push('Custom Notification requires recipient user IDs');
    if(typeof properties.title!=='string'||!properties.title.trim()||properties.title.length>120)
     errors.push('Custom Notification requires a title of at most 120 characters');
    if(properties.messageBody!==undefined
      &&(typeof properties.messageBody!=='string'||properties.messageBody.length>2000))
     errors.push('Custom Notification message must be at most 2000 characters');
   }else
    errors.push('Unsupported Flow action: '+String(properties.actionType??''));
  }
  if(type==='Subflow'){
   if(typeof properties.flowApiName!=='string'||! /^[A-Za-z][A-Za-z0-9_]*$/.test(properties.flowApiName)
     ||properties.flowApiName===apiName)
    errors.push('Subflow requires a different Flow API name');
   for(const property of ['inputValues','outputValues']){
    const value=properties[property]??'';
    if(typeof value!=='string'||value.length>8192
      ||value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)
        .some(line=>! /^[A-Za-z][A-Za-z0-9_]*\s*=\s*[^=].{0,4095}$/.test(line)))
     errors.push('Subflow '+property+' mappings are invalid');
   }
  }
  if(type==='Publish Platform Event'){
   if(data.flowType==='Record-Triggered Flow'&&beforeSave)
    errors.push('Before-save Record-Triggered Flows cannot publish Platform Events');
   if(data.flowType==='Platform Event-Triggered Flow')
    errors.push('Platform Event-Triggered Flows cannot recursively publish Platform Events');
   if(typeof properties.eventApiName!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.eventApiName))
    errors.push('Publish Platform Event requires an enabled event');
   if(!Array.isArray(properties.fieldValues)||properties.fieldValues.length>100)
    errors.push('Publish Platform Event supports at most 100 field mappings');
   else {
    const mappedFields=new Set<string>();
    for(const mapping of properties.fieldValues){
    const item=mapping&&typeof mapping==='object'&&!Array.isArray(mapping)
     ?mapping as Record<string,unknown>:{};
    if(typeof item.field!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(item.field)
      ||typeof item.value!=='string'||item.value.length>4096)
     errors.push('Publish Platform Event field mappings require valid fields and values');
    else if(mappedFields.has(item.field))errors.push('Publish Platform Event fields may be mapped only once');
    else mappedFields.add(item.field);
    }
   }
   if(typeof properties.eventApiName==='string'&&db
     &&/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.eventApiName)){
    await rbac.require(tenantId,userId,'SystemDefinition:platform-events','read');
    const {rows:events}=await db.query<{api_name:string;field_api:string|null}>(`
     SELECT d.api_name,f.field_api FROM md_system_definitions d
     LEFT JOIN md_platform_event_fields f
      ON f.tenant_id=d.tenant_id AND f.event_api_name=d.api_name
     WHERE d.tenant_id=$1 AND d.kind='platform-events' AND d.api_name=$2 AND d.enabled=true
     ORDER BY f.sort_order,f.field_api`,
     [tenantId,properties.eventApiName]);
    const fieldNames=new Set(events.map(event=>event.field_api).filter(
     (field):field is string=>typeof field==='string'));
    if(!events.length)errors.push('Publish Platform Event references an unavailable event');
    for(const mapping of Array.isArray(properties.fieldValues)?properties.fieldValues:[]){
     const field=mapping&&typeof mapping==='object'&&!Array.isArray(mapping)
      ?String((mapping as Record<string,unknown>).field??''):'';
     if(field&&!fieldNames.has(field))errors.push('Publish Platform Event references an unknown field');
    }
   }
  }
  if(type==='Screen'){
   const fields=properties.fields;
   if(!Array.isArray(fields)||fields.length>100)errors.push('Screen must declare up to 100 fields');
   else {
    const names=new Set<string>();
    for(const field of fields){
     if(!field||typeof field!=='object'||Array.isArray(field)){errors.push('Invalid Screen field');continue;}
     const name=(field as Record<string,unknown>).apiName;
     if(typeof name!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)||names.has(name))
      errors.push('Screen fields require unique safe API names');
     else names.add(name);
    }
   }
  }
  if(type==='Decision'&&Array.isArray(properties.outcomes)){
   for(const outcome of properties.outcomes){
    if(!outcome||typeof outcome!=='object'||Array.isArray(outcome)){
     errors.push('Decision contains an invalid outcome');continue;
    }
    validConditionList((outcome as Record<string,unknown>).conditions,
     data.flowType==='Record-Triggered Flow','Decision outcome conditions',
     data.flowType==='Record-Triggered Flow'?/^\{!\$Record\.[A-Za-z][A-Za-z0-9_]*\}$/:undefined);
   }
  }
  if(type==='Wait'){
   try{resolveFlowWaitUntil(properties);}
   catch(error){errors.push(error instanceof Error?error.message:'Wait configuration is invalid');}
  }
 }
 if([...types.values()].filter(x=>x==='Start').length!==1)errors.push('Flow must contain exactly one Start');
 if(![...types.values()].includes('End'))errors.push('Flow must contain an End');
 const outgoing=new Map<number,number[]>(),incoming=new Map<number,number[]>();
 const connectors=new Map<number,Array<{to:number;label:string;kind:string}>>();
 let scheduledPathCount=0;
 for(const link of links){
  if(!link||typeof link!=='object'||Array.isArray(link)){errors.push('Invalid Flow connector');continue;}
  const edge=link as Record<string,unknown>;
  if(typeof edge.from!=='number'||typeof edge.to!=='number'||!ids.has(edge.from)||!ids.has(edge.to)){
   errors.push('Flow connector references an unknown element');continue;
  }
  if(edge.kind!==undefined&&!['normal','fault','scheduled'].includes(String(edge.kind)))
   errors.push('Unsupported SQL Flow connector type');
  const kind=String(edge.kind??'normal');
  if(kind==='scheduled'){
   scheduledPathCount++;
   const source=nodes.find(item=>item&&typeof item==='object'&&!Array.isArray(item)
    &&(item as Record<string,unknown>).id===edge.from) as Record<string,unknown>|undefined;
   const configuration=edge.scheduledPath;
   if(data.flowType!=='Record-Triggered Flow'||beforeSave||source?.type!=='Start')
    errors.push('Scheduled Paths are supported only from after-save Record-Triggered Flow Start elements');
   if(scheduledPathCount>20)errors.push('A Flow may contain at most 20 Scheduled Paths');
   if(!configuration||typeof configuration!=='object'||Array.isArray(configuration)){
    errors.push('Scheduled Path requires time source and offset configuration');
   }else{
    const path=configuration as Record<string,unknown>,field=path.timeSourceFieldApiName,
     amount=Number(path.offsetAmount),unit=String(path.offsetUnit);
    if(typeof field!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(field))
     errors.push('Scheduled Path requires a valid time source field');
    if(!Number.isSafeInteger(amount)||Math.abs(amount)>3650
      ||!['Minutes','Hours','Days'].includes(unit))
     errors.push('Scheduled Path offset must be an integer from -3650 to 3650 Minutes, Hours or Days');
    if(typeof field==='string'&&/^[A-Za-z][A-Za-z0-9_]*$/.test(field)){
     if(!db)errors.push('Scheduled Path field validation requires SQL metadata');
     else{
      const {rows:fieldRows}=await db.query<{data_type:string}>(`
       SELECT data_type FROM md_field_definitions
       WHERE tenant_id=$1 AND object_api=$2 AND api_name=$3 AND deleted_at IS NULL`,
       [tenantId,startConfig.object,field]);
      if(!['date','datetime'].includes(fieldRows[0]?.data_type??''))
       errors.push('Scheduled Path time source must be a Date or DateTime field');
      else await rbac.require(tenantId,userId,
       String(startConfig.object)+'.'+field,'read');
     }
    }
   }
  }
  outgoing.set(edge.from,[...(outgoing.get(edge.from)??[]),edge.to]);
  incoming.set(edge.to,[...(incoming.get(edge.to)??[]),edge.from]);
  connectors.set(edge.from,[...(connectors.get(edge.from)??[]),{
   to:edge.to,label:String(edge.label??''),kind
  }]);
 }
 for(const id of ids)
  if(types.get(id)==='End'&&(outgoing.get(id)?.length??0)>0)
   errors.push('End must not have outgoing connectors: '+id);
 const canFinish=new Set<number>();
 const reverseStack=[...types].filter(([,type])=>type==='End').map(([id])=>id);
 while(reverseStack.length){
  const id=reverseStack.pop()!;
  if(canFinish.has(id))continue;
  canFinish.add(id);
  reverseStack.push(...(incoming.get(id)??[]));
 }
 const start=[...types].find(([,type])=>type==='Start')?.[0];
 if(start!==undefined){
  const visited=new Set<number>(),stack=[start];
  while(stack.length){
   const id=stack.pop()!;
   if(visited.has(id))continue;
   visited.add(id);
   stack.push(...(outgoing.get(id)??[]));
  }
  if(![...visited].some(id=>types.get(id)==='End'))errors.push('No reachable End element');
  for(const id of visited){
   if(!canFinish.has(id))errors.push('Flow path cannot reach End from element: '+id);
   if(types.get(id)!=='End'&&!(connectors.get(id)??[]).some(edge=>edge.kind==='normal'))
    errors.push('Flow element requires a normal outgoing path: '+id);
  }
  for(const id of ids)if(!visited.has(id))warnings.push('Disconnected Flow element: '+id);
 }
 for(const raw of nodes){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))continue;
  const node=raw as Record<string,unknown>;
  if(node.type!=='Decision'||typeof node.id!=='number')continue;
  const config=node.config as Record<string,unknown>|undefined;
  const outcomes=Array.isArray(config?.outcomes)?config.outcomes as Array<Record<string,unknown>>:[];
  const labels=outcomes.map(outcome=>outcome?.name==='Default'
    ?'Default':String(outcome?.label??outcome?.name??'')).filter(Boolean);
  if(!labels.includes('Default'))labels.push('Default');
  if(new Set(labels).size!==labels.length)errors.push('Duplicate Decision outcome labels: '+node.id);
  const paths=(connectors.get(node.id)??[]).filter(edge=>edge.kind==='normal');
  for(const label of labels)
   if(paths.filter(edge=>edge.label===label).length!==1)
    errors.push('Decision outcome needs exactly one connector: '+node.id+' / '+label);
  for(const path of paths)if(!labels.includes(path.label))
   errors.push('Decision has an unmatched outcome connector: '+node.id+' / '+path.label);
 }
 return {valid:errors.length===0,errors,warnings};
}
