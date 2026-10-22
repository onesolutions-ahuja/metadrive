import type {PoolClient} from 'pg';
import {encodeMetadataValue} from '../system-files/component-runtime.js';
import {ACEASSIST_BOOKING_OVERLAP,ACEASSIST_BOOKING_AVAILABILITY}
 from './aceassist-booking-guards.js';

/** Autolaunched draft called only by an explicitly configured, signed inbound
 * webhook parsing Flow. No anonymous record CRUD, no JavaScript in AceAssist UI.
 * Input names are a no-code contract for provider Parse JSON and mapping nodes.
 */
export const ACEASSIST_WHATSAPP_BOOKING_API='AceAssistWhatsAppCreateBooking';
export async function seedAceAssistWhatsAppBookingFlow(client:PoolClient,tenantId:string):Promise<number>{
 const existing=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
  [tenantId,ACEASSIST_WHATSAPP_BOOKING_API]);
 if(existing.rowCount)return 0;
 const graph={
  apiName:ACEASSIST_WHATSAPP_BOOKING_API,
  label:'Ace Assist - Verified WhatsApp booking (tenant-authored mapping)',
  appApiName:'AceAssist',flowType:'Autolaunched Flow',status:'Draft',version:1,tests:[],
  startConfig:{businessCalendarGuard:{startInput:'startDateTime',endInput:'endDateTime'}},
  resources:[
   ...['externalMessageId','phone','serviceId','staffId','startDateTime','endDateTime']
    .map(name=>({name,type:'Variable',dataType:'Text',availableForInput:true})),
   {name:'appointmentId',type:'Variable',dataType:'Text',availableForOutput:true},
   {name:'existing',type:'Record',dataType:'Appointment'},
   {name:'customer',type:'Record',dataType:'Customer'},
   {name:'service',type:'Record',dataType:'Product'}
  ],
  elements:[
   {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
   {id:2,type:'Get Records',label:'Deduplicate provider message',config:{
    object:'Appointment',recordLimit:'1',outputVariable:'existing',
    conditions:[{field:'ExternalBookingId',operator:'Equals',value:'{!externalMessageId}'}]}},
   {id:3,type:'Decision',label:'Already processed?',config:{outcomes:[
    {name:'New',label:'New',conditions:[{field:'{!existing}',operator:'IsNull'}]}]}},
   {id:4,type:'Get Records',label:'Find authorised customer by phone',config:{
    object:'Customer',recordLimit:'1',outputVariable:'customer',
    conditions:[{field:'Phone',operator:'Equals',value:'{!phone}'}]}},
   {id:5,type:'Get Records',label:'Find active service',config:{
    object:'Product',recordLimit:'1',outputVariable:'service',
    conditions:[{field:'Id',operator:'Equals',value:'{!serviceId}'}]}},
   {id:6,type:'Decision',label:'Provider booking is valid?',config:{outcomes:[
    {name:'Valid',label:'Valid',conditionLogic:'All',conditions:[
     {field:'{!customer}',operator:'IsNotNull'},
     {field:'{!service.Active}',operator:'Equals',value:true},
     {field:'{!externalMessageId}',operator:'IsNotNull'}]}]}},
   {id:7,type:'Create Records',label:'Save through shared RecordEngine',config:{
    object:'Appointment',recordSource:'fields',resultVariable:'appointmentId',
    overlapGuard:ACEASSIST_BOOKING_OVERLAP,availabilityGuard:ACEASSIST_BOOKING_AVAILABILITY,
    uniqueInputGuard:{field:'ExternalBookingId'},
    fieldValues:[
     {field:'Name',value:'WhatsApp booking'},
     {field:'Customer',value:'{!customer.Id}'},
     {field:'ServiceProduct',value:'{!service.Id}'},
     {field:'Service',value:'{!service.Name}'},
     {field:'AssignedTo',value:'{!staffId}'},
     {field:'StartDateTime',value:'{!startDateTime}'},
     {field:'EndDateTime',value:'{!endDateTime}'},
     {field:'ExternalBookingId',value:'{!externalMessageId}'},
     {field:'Status',value:'Scheduled'}
    ]}},
   {id:8,type:'End',label:'Done',config:{}},
   {id:9,type:'Custom Error',label:'Invalid customer or service',config:{
    errorLocation:'Page',errorMessage:'Incoming WhatsApp booking could not be validated.'}}
  ],
  connectors:[
   {from:1,to:2,kind:'normal',label:'Next'},
   {from:2,to:3,kind:'normal',label:'Next'},
   {from:3,to:4,kind:'normal',label:'New'},
   {from:3,to:8,kind:'normal',label:'Default'},
   {from:4,to:5,kind:'normal',label:'Next'},
   {from:5,to:6,kind:'normal',label:'Next'},
   {from:6,to:7,kind:'normal',label:'Valid'},
   {from:6,to:9,kind:'normal',label:'Default'},
   {from:7,to:8,kind:'normal',label:'Next'},
   {from:9,to:8,kind:'normal',label:'Next'}
  ]
 };
 const {rows}=await client.query<{id:string}>(`
  INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
  VALUES($1,$2,$3,'Autolaunched Flow',1,false) RETURNING id`,
  [tenantId,graph.apiName,graph.label]);
 const metadata:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graph,'/builder',metadata);
 for(const x of metadata)await client.query(`
  INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
  VALUES($1,$2,$3,$4,$5)`,[tenantId,rows[0].id,x.path,x.kind,x.text]);
 await client.query(`INSERT INTO md_permission_sets
  (tenant_id,api_name,label,description,navigation_default_access)
  VALUES($1,'AceAssistWhatsAppBookingService','Ace Assist WhatsApp Booking Service',
   'Explicitly authorised execution user for verified provider booking','Deny')
  ON CONFLICT(tenant_id,api_name) DO NOTHING`,[tenantId]);
 const rights=[
  ['Flow:AceAssistWhatsAppCreateBooking','execute'],
  ['Appointment','read'],['Appointment','create'],
  ['Customer','read'],['Customer.Phone','read'],['Customer.Id','read'],
  ['Product','read'],['Product.Name','read'],['Product.Active','read'],
  ...['Name','ExternalBookingId','Customer','ServiceProduct','Service','AssignedTo',
   'StartDateTime','EndDateTime','Status'].flatMap(x=>[
    ['Appointment.'+x,'read'],['Appointment.'+x,'create']])
 ];
 for(const [resource,action] of rights)await client.query(`
  INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
  SELECT $1,p.id,$2,$3,'allow' FROM md_permission_sets p
  WHERE p.tenant_id=$1 AND p.api_name='AceAssistWhatsAppBookingService'
  ON CONFLICT DO NOTHING`,[tenantId,resource,action]);
 return 1;
}
