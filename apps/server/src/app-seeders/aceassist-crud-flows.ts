import type {SqlPersistence} from '../system-files/sql-persistence.js';
import {encodeMetadataValue} from '../system-files/component-runtime.js';
import {syncFlowTriggerSubscription} from '../flow-engine/FlowVersionManager.js';
import {seedAceAssistCommunicationTemplates} from './aceassist-communication-templates.js';
import {seedAceAssistDocumentSeries} from './aceassist-document-series.js';
import {seedAceAssistFinancialFlows} from './aceassist-financial-flows.js';
import {seedAceAssistDocumentFlows} from './aceassist-document-flows.js';
import {seedAceAssistReminderFlows} from './aceassist-reminder-flows.js';
import {seedAceAssistPaymentFlows} from './aceassist-payment-flows.js';
import {seedCashLedgerFlows} from './core-cash-ledger-flows.js';
import {seedAppointmentLines} from './aceassist-appointment-lines.js';
import {ACEASSIST_BOOKING_OVERLAP,ACEASSIST_BOOKING_AVAILABILITY} from './aceassist-booking-guards.js';
import {seedAceAssistWhatsAppBookingFlow} from './aceassist-whatsapp-booking-flow.js';
import {ACEASSIST_SCHEDULING_OBJECTS,ACEASSIST_SCHEDULING_FIELD_NAMES,seedAceAssistSchedulingObjects} from './aceassist-scheduling-objects.js';

export const ACEASSIST_CRUD_OBJECTS = [
 'Appointment','Customer','Quotation','QuotationLine','Invoice','InvoiceLine'
] as const;

export const ACEASSIST_EDITABLE_FIELDS:Record<string,readonly string[]>={
 Appointment:['Name','StartDateTime','EndDateTime','Status','Customer','Service','ServiceProduct','Location','Resource','AssignedTo','AssignedUser','Description','Notes'],
 Customer:['Name','Email','Phone','BillingAddress','ShippingAddress','Active'],
 Quotation:['Name','Customer','IssueDate','ExpiryDate','Status','Notes','CurrencyCode','Subtotal','DiscountAmount','TaxAmount','Total'],
 QuotationLine:['Name','Quotation','Product','Description','Quantity','UnitPrice','DiscountAmount','TaxAmount','LineTotal'],
 Invoice:['Name','Customer','InvoiceDate','DueDate','Status','Notes','CurrencyCode','Subtotal','DiscountAmount','TaxAmount','Total'],
 InvoiceLine:['Name','Invoice','Product','Description','Quantity','UnitPrice','DiscountAmount','TaxAmount','LineTotal']
};
type FlowGraph={apiName:string;label:string;appApiName:string;flowType:string;status:string;version:number;startConfig?:Record<string,unknown>;elements:Array<{id:number;type:string;label:string;config:Record<string,unknown>}>;connectors:Array<{from:number;to:number;kind:string;label:string}>;resources:Array<Record<string,unknown>>;tests:unknown[]};
const start={id:1,type:'Start',label:'Start',config:{executionContext:'User'}};
const end={id:3,type:'End',label:'End',config:{}};
const lineTotals=(objectApi:'QuotationLine'|'InvoiceLine')=>({
 parentObject:objectApi==='QuotationLine'?'Quotation':'Invoice',
 parentField:objectApi==='QuotationLine'?'Quotation':'Invoice',
 quantityField:'Quantity',unitPriceField:'UnitPrice',discountField:'DiscountAmount',
 taxField:'TaxAmount',lineTotalField:'LineTotal',subtotalField:'Subtotal',
 discountTotalField:'DiscountAmount',taxTotalField:'TaxAmount',totalField:'Total',
 ...(objectApi==='InvoiceLine'?{statusField:'Status',lockedStatuses:['Issued','PartPaid','Paid','PartiallyPaid'],numberField:'InvoiceNumber'}:
  {statusField:'Status',lockedStatuses:['Accepted','Approved','Converted']})
});
function makeGraph(objectApi:string,operation:'Load'|'Create'|'Update'|'Delete',availableFields:string[]):FlowGraph {
 const apiName='AceAssist'+operation+objectApi;
 const name=operation+' '+objectApi;
 const resources:Array<Record<string,unknown>>=[];
 let config:Record<string,unknown>={object:objectApi,
  ...((objectApi==='QuotationLine'||objectApi==='InvoiceLine')&&operation!=='Load'
   ?{documentLineTotals:lineTotals(objectApi)}:{})};
 if(operation==='Load'){
  const collection=objectApi.charAt(0).toLowerCase()+objectApi.slice(1)+'Records';
  config={...config,recordLimit:'all',outputVariable:collection};
  resources.push({name:collection,type:'Record Collection',dataType:objectApi,availableForOutput:true});
 }else {
  resources.push({name:'recordId',type:'Variable',dataType:'Text',availableForInput:true});
  for(const field of availableFields)resources.push({name:field,type:'Variable',dataType:'Text',availableForInput:true});
  if(operation==='Create') {
   config={...config,recordSource:'fields',fieldValues:availableFields.map(field=>({field,value:'{!'+field+'}'})),
    resultVariable:'createdRecordId'};
   resources.push({name:'createdRecordId',type:'Variable',dataType:'Text',availableForOutput:true});
  }else if(operation==='Update'){
   config={...config,recordId:'{!recordId}',fieldValues:availableFields.map(field=>({field,value:'{!'+field+'}'}))};
  }else config={...config,recordId:'{!recordId}'};
 }
 return {apiName,label:'Ace Assist - '+name,appApiName:'AceAssist',
  flowType:'Autolaunched Flow',status:'Active',version:1,
  ...(objectApi==='Appointment'&&(operation==='Create'||operation==='Update')
    ?{startConfig:{businessCalendarGuard:{startInput:'StartDateTime',endInput:'EndDateTime'}}}:{}),
  elements:[start,{id:2,type:operation==='Load'?'Get Records':operation+' Records',label:name,config},end],
  connectors:[{from:1,to:2,kind:'normal',label:'Next'},{from:2,to:3,kind:'normal',label:'Next'}],
  resources,tests:[]};
}
/** Additive booking metadata; existing custom tenant fields are never altered. */
const bookingFields=[
 {object:'Product',api:'IsService',type:'boolean'},
 {object:'Product',api:'OnlineBookable',type:'boolean'},
 {object:'Product',api:'DurationMinutes',type:'number'},
 {object:'Product',api:'BookingBufferMinutes',type:'number'},
 {object:'Appointment',api:'ServiceProduct',type:'reference',related:'Product'},
 {object:'Appointment',api:'Resource',type:'reference',related:'BookableResource'}
] as const;

function makeDynamicGraph(objectApi:string,operation:'Create'|'Update'):FlowGraph {
 const apiName='AceAssist'+operation+(objectApi==='Appointment'?'V3':'V2')+objectApi;
 const input='recordsInput';
 const resources:Array<Record<string,unknown>>=[
  {name:input,type:'Record Collection',dataType:objectApi,isCollection:true,availableForInput:true}
 ];
 if(operation==='Create')resources.push({name:'createdRecords',type:'Record Collection',
  dataType:objectApi,isCollection:true,availableForOutput:true});
 const config:Record<string,unknown>={object:objectApi,recordSource:'collection',collection:input,
  ...((objectApi==='QuotationLine'||objectApi==='InvoiceLine')?{documentLineTotals:lineTotals(objectApi)}:{}),
  ...(operation==='Create'?{resultVariable:'createdRecords'}:{fieldSource:'record'}),
  ...(objectApi==='Appointment'?{
   overlapGuard:ACEASSIST_BOOKING_OVERLAP,
   availabilityGuard:ACEASSIST_BOOKING_AVAILABILITY
  }:{})};
 return {apiName,label:'Ace Assist - '+operation+' '+objectApi+' (metadata fields)',
  appApiName:'AceAssist',flowType:'Autolaunched Flow',status:'Active',version:1,
  ...(objectApi==='Appointment'?{startConfig:{
   businessCalendarGuard:{startInput:'StartDateTime',endInput:'EndDateTime',
    collectionInput:input}}}:{}),
  elements:[start,{id:2,type:operation+' Records',label:operation+' '+objectApi,config},end],
  connectors:[{from:1,to:2,kind:'normal',label:'Next'},{from:2,to:3,kind:'normal',label:'Next'}],
  resources,tests:[]};
}

/** Only an installed and licensed Ace Assist tenant receives missing Flow metadata.
 * Existing Flows and published versions are never overwritten. No demo business data.
 */
export async function seedAceAssistCrudFlows(db:SqlPersistence):Promise<number> {
 const {rows:tenants}=await db.query<{tenant_id:string}>(`
  SELECT DISTINCT i.tenant_id FROM md_app_installations i
  JOIN md_apps a ON a.id=i.app_id AND a.api_name='AceAssist' AND a.enabled
  JOIN md_app_entitlements e ON e.app_id=i.app_id AND e.tenant_id=i.tenant_id
  WHERE e.active AND (e.expires_at IS NULL OR e.expires_at>now())`);
 let created=0;
 for(const {tenant_id} of tenants)await db.transaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[tenant_id+':aceassist:crud']);
  await seedAceAssistSchedulingObjects(client,tenant_id);
  await seedAceAssistDocumentSeries(client,tenant_id);
  created+=await seedAceAssistFinancialFlows(client,tenant_id);
  created+=await seedAceAssistDocumentFlows(client,tenant_id);
  created+=await seedAceAssistPaymentFlows(client,tenant_id);
  created+=await seedCashLedgerFlows(client,tenant_id);
  created+=await seedAppointmentLines(client,tenant_id);
  created+=await seedAceAssistWhatsAppBookingFlow(client,tenant_id);
  created+=await seedAceAssistReminderFlows(client,tenant_id);
  created+=await seedAceAssistCommunicationTemplates(client,tenant_id);
  // Install optional shared booking Fields only for an entitled AceAssist tenant.
  for(const field of bookingFields){
   const object=await client.query('SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',
    [tenant_id,field.object]);
   if(!object.rowCount)continue;
   if('related' in field){
    const target=await client.query('SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',
     [tenant_id,field.related]);
    if(!target.rowCount)continue;
   }
   await client.query(`INSERT INTO md_field_definitions
    (tenant_id,object_api,api_name,label,data_type,related_object,required)
    VALUES($1,$2,$3,$4,$5,$6,false) ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,
    [tenant_id,field.object,field.api,field.api.replace(/([a-z])([A-Z])/g,'$1 $2'),field.type,
     'related' in field?field.related:null]);
  }
  const {rows:defined}=await client.query<{object_api:string;api_name:string}>(`
    SELECT object_api,api_name FROM md_field_definitions
    WHERE tenant_id=$1 AND deleted_at IS NULL
      AND object_api=ANY($2::text[])`,[tenant_id,ACEASSIST_CRUD_OBJECTS]);
  const fieldSet=new Set(defined.map(x=>x.object_api+'.'+x.api_name));
  await client.query(`
   INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
   SELECT $1,p.id,'BusinessCalendar','read','allow'
   FROM md_permission_sets p WHERE p.tenant_id=$1 AND p.api_name='AceAssistUser'
   ON CONFLICT DO NOTHING`,[tenant_id]);
  for(const objectApi of ACEASSIST_CRUD_OBJECTS){
   if(!fieldSet.has(objectApi+'.Name'))continue;
   const fields=ACEASSIST_EDITABLE_FIELDS[objectApi].filter(f=>fieldSet.has(objectApi+'.'+f));
   for(const operation of ['Load','Create','Update','Delete'] as const){
    const graph=makeGraph(objectApi,operation,fields);
    const existing=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
      [tenant_id,graph.apiName]);
    if(existing.rowCount)continue;
    const {rows:inserted}=await client.query<{id:string}>(`
      INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
      VALUES($1,$2,$3,'Autolaunched Flow',1,true) RETURNING id`,
      [tenant_id,graph.apiName,graph.label]);
    const entries:Array<{path:string;kind:string;text:string|null}>=[];
    encodeMetadataValue(graph,'/builder',entries);
    for(const e of entries)await client.query(`
      INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
      VALUES($1,$2,$3,$4,$5)`,[tenant_id,inserted[0].id,e.path,e.kind,e.text]);
    created++;
   }
   // V2 uses the shared record-collection Flow source, allowing tenant-defined
   // Field metadata to reach RecordEngine without app-specific field maps.
   // Preserve any existing V2 Flow or customer-authored version.
   for(const operation of ['Create','Update'] as const){
    const graph=makeDynamicGraph(objectApi,operation);
    const found=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
     [tenant_id,graph.apiName]);
    if(found.rowCount)continue;
    const {rows:added}=await client.query<{id:string}>(`
     INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
     VALUES($1,$2,$3,'Autolaunched Flow',1,true) RETURNING id`,
     [tenant_id,graph.apiName,graph.label]);
    const entries:Array<{path:string;kind:string;text:string|null}>=[];
    encodeMetadataValue(graph,'/builder',entries);
    for(const e of entries)await client.query(`
      INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
      VALUES($1,$2,$3,$4,$5)`,[tenant_id,added[0].id,e.path,e.kind,e.text]);
    created++;
   }
   // App access and individual Object/Field permissions remain in OneEngine.
   // No user assignments, record-level overrides or bypasses.
   const rights=[
    ...(['read','create','edit','delete'] as const).map(action=>[objectApi,action]),
    ...fields.flatMap(field=>(['read','create','edit'] as const).map(action=>[objectApi+'.'+field,action])),
    ...(['Load','Create','Update','Delete'] as const).flatMap(operation=>
      objectApi==='Appointment'&&['Create','Update'].includes(operation)?[]:
       [['Flow:AceAssist'+operation+objectApi,'execute']]),
    ...(['Create','Update'] as const).map(operation=>
      ['Flow:AceAssist'+operation+(objectApi==='Appointment'?'V3':'V2')+objectApi,'execute'])
   ];
   for(const [resource,action] of rights)await client.query(`
    INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
    SELECT $1,p.id,$2,$3,'allow' FROM md_permission_sets p
    WHERE p.tenant_id=$1 AND p.api_name='AceAssistUser'
    ON CONFLICT DO NOTHING`,[tenant_id,resource,action]);
  }
  // Reference data is read exclusively through OneEngine Get Records Flows.
  // Never grant mutation rights to User or Product from this application.
  for(const lookupObject of ['User','Product']){
   const exists=await client.query<{id:string}>(
    'SELECT id FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',
    [tenant_id,lookupObject]);
   if(!exists.rows[0])continue;
   const graph=makeGraph(lookupObject,'Load',[]);
   const prior=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
    [tenant_id,graph.apiName]);
   if(!prior.rowCount){
    const {rows:added}=await client.query<{id:string}>(`
      INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
      VALUES($1,$2,$3,'Autolaunched Flow',1,true) RETURNING id`,
      [tenant_id,graph.apiName,graph.label]);
    const entries:Array<{path:string;kind:string;text:string|null}>=[];
    encodeMetadataValue(graph,'/builder',entries);
    for(const e of entries)await client.query(`
      INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
      VALUES($1,$2,$3,$4,$5)`,[tenant_id,added[0].id,e.path,e.kind,e.text]);
    created++;
   }
   // Tenant visibility and field-level access are still decided by OneEngine.
   for(const [resource,action] of [[lookupObject,'read'],
    ['Flow:AceAssistLoad'+lookupObject,'execute']])
    await client.query(`
      INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
      SELECT $1,p.id,$2,$3,'allow' FROM md_permission_sets p
      WHERE p.tenant_id=$1 AND p.api_name='AceAssistUser'
      ON CONFLICT DO NOTHING`,[tenant_id,resource,action]);
  }
  // Scheduling catalog is read through authorised Get Records Flows.
  // Changes to staff shifts and resource settings require Object Manager/RBAC administration.
  for(const item of ACEASSIST_SCHEDULING_OBJECTS){
   const graph=makeGraph(item.api,'Load',ACEASSIST_SCHEDULING_FIELD_NAMES[item.api]);
   const existing=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
    [tenant_id,graph.apiName]);
   if(!existing.rowCount){
    const {rows:inserted}=await client.query<{id:string}>(`
     INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
     VALUES($1,$2,$3,'Autolaunched Flow',1,true) RETURNING id`,
     [tenant_id,graph.apiName,graph.label]);
    const entries:Array<{path:string;kind:string;text:string|null}>=[];
    encodeMetadataValue(graph,'/builder',entries);
    for(const e of entries)await client.query(`
     INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
     VALUES($1,$2,$3,$4,$5)`,[tenant_id,inserted[0].id,e.path,e.kind,e.text]);
    created++;
   }
   for(const [resource,action] of [[item.api,'read'],
     ['Flow:'+graph.apiName,'execute'],
     ...ACEASSIST_SCHEDULING_FIELD_NAMES[item.api].map(field=>[item.api+'.'+field,'read'])]){
    await client.query(`
     INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
     SELECT $1,p.id,$2,$3,'allow' FROM md_permission_sets p
     WHERE p.tenant_id=$1 AND p.api_name='AceAssistUser' ON CONFLICT DO NOTHING`,
     [tenant_id,resource,action]);
   }
  }
  // Generic HTTP email-provider template. The tenant supplies an HTTPS Named
  // Credential, provider-specific relative path and JSON payload before activation.
  // The seed intentionally contains no endpoint or secret from any provider.
  const emailHttpFlowApi='AceAssistEmailHttpCallout';
  const priorEmailHttpFlow=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',[tenant_id,emailHttpFlowApi]);
  if(!priorEmailHttpFlow.rowCount){
   const graph={
    apiName:emailHttpFlowApi,label:'Ace Assist - Email Provider HTTP Callout',appApiName:'AceAssist',
    flowType:'Autolaunched Flow',status:'Draft',version:1,
    resources:[
     {name:'emailPath',type:'Variable',dataType:'Text',availableForInput:true},
     {name:'emailPayload',type:'Variable',dataType:'Text',availableForInput:true}
    ],
    elements:[
     {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
     {id:2,type:'HTTP Callout',label:'Send email through configured provider',config:{
      method:'POST',namedCredentialId:'',path:'{!emailPath}',body:'{!emailPayload}',
      deliveryMode:'DURABLE_ASYNC',onError:'FAULT_PATH'
     }},
     {id:3,type:'End',label:'End',config:{}}
    ],
    connectors:[{from:1,to:2,kind:'normal',label:'Next'},{from:2,to:3,kind:'normal',label:'Queued'},
     {from:2,to:3,kind:'fault',label:'Callout fault'}],
    tests:[]
   };
   const {rows:added}=await client.query<{id:string}>(`
    INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
    VALUES($1,$2,$3,'Autolaunched Flow',1,false) RETURNING id`,
    [tenant_id,graph.apiName,graph.label]);
   const entries:Array<{path:string;kind:string;text:string|null}>=[];
   encodeMetadataValue(graph,'/builder',entries);
   for(const e of entries)await client.query(`
    INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
    VALUES($1,$2,$3,$4,$5)`,[tenant_id,added[0].id,e.path,e.kind,e.text]);
   created++;
  }
  for(const [resource,action] of [
   ['Flow:'+emailHttpFlowApi,'execute'],['NamedCredential','read']
  ])await client.query(`
   INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
   SELECT $1,p.id,$2,$3,'allow' FROM md_permission_sets p
   WHERE p.tenant_id=$1 AND p.api_name='AceAssistUser' ON CONFLICT DO NOTHING`,
   [tenant_id,resource,action]);

  // App-owned record trigger: no frontend notification business logic.
  // Recipient is the authenticated operator; delivery failure follows the fault connector
  // and never rolls back the business record. Tenant-authored definitions are preserved.
  const notificationApi='AceAssistAppointmentChanged';
  const priorNotification=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
   [tenant_id,notificationApi]);
  if(!priorNotification.rowCount){
   const trigger={object:'Appointment',trigger:'created-or-updated',
    runWhen:'after-save',entryConditions:[],conditionLogic:'All',triggerOrder:100};
   const graph={
    apiName:notificationApi,label:'Ace Assist - booking activity notification',
    appApiName:'AceAssist',flowType:'Record-Triggered Flow',triggerObject:'Appointment',
    status:'Active',version:1,startConfig:trigger,
    resources:[],
    elements:[
     {id:1,type:'Start',label:'Appointment saved',config:trigger},
     {id:2,type:'Action',label:'Notify operator',config:{
      actionType:'Custom Notification',recipientIds:'{!$User.Id}',
      title:'Appointment activity',messageBody:'An appointment was created or updated.'
     }},
     {id:3,type:'End',label:'End',config:{}}
    ],
    connectors:[
     {from:1,to:2,kind:'normal',label:'Notify'},
     {from:2,to:3,kind:'normal',label:'Continue'},
     {from:2,to:3,kind:'fault',label:'Notification failure'}
    ],tests:[]
   };
   const {rows:added}=await client.query<{id:string}>(`
    INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
    VALUES($1,$2,$3,'Record-Triggered Flow',1,true) RETURNING id`,
    [tenant_id,graph.apiName,graph.label]);
   const entries:Array<{path:string;kind:string;text:string|null}>=[];
   encodeMetadataValue(graph,'/builder',entries);
   for(const e of entries)await client.query(`
    INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
    VALUES($1,$2,$3,$4,$5)`,[tenant_id,added[0].id,e.path,e.kind,e.text]);
   await syncFlowTriggerSubscription(client,tenant_id,notificationApi,added[0].id,{
    active:true,flowType:graph.flowType,elements:graph.elements,appApiName:'AceAssist'});
   created++;
  }
  for(const [resource,action] of [
   ['Notification','send'],
   ['Flow:'+notificationApi,'execute']
  ])await client.query(`
   INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
   SELECT $1,p.id,$2,$3,'allow' FROM md_permission_sets p
   WHERE p.tenant_id=$1 AND p.api_name='AceAssistUser'
   ON CONFLICT DO NOTHING`,[tenant_id,resource,action]);

 });
 return created;
}
