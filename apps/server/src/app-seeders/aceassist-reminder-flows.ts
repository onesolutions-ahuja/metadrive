import type {PoolClient} from 'pg';
import {encodeMetadataValue} from '../system-files/component-runtime.js';
import {syncFlowTriggerSubscription} from '../flow-engine/FlowVersionManager.js';

type Node={id:number;type:string;label:string;config:Record<string,unknown>};
type Edge={from:number;to:number;kind:string;label:string;scheduledPath?:{
 timeSourceFieldApiName:string;offsetAmount:number;offsetUnit:string}};
const startConfig={object:'Appointment',trigger:'created-or-updated',
 runWhen:'after-save',entryConditions:[],conditionLogic:'All',triggerOrder:120};
const start:Node={id:1,type:'Start',label:'Appointment changes',config:startConfig};
const end:Node={id:7,type:'End',label:'Done',config:{}};
const edge=(from:number,to:number,label='Next',kind='normal'):Edge=>({from,to,kind,label});
function reminderGraph(channel:'Internal'|'Email'|'WhatsApp',credentialId:string|null){
 const apiName='AceAssistAppointmentReminder'+channel;
 const internal=channel==='Internal';
 const getCustomer:Node={id:2,type:'Get Records',label:'Read permitted booking customer',config:{
  object:'Customer',recordLimit:'1',outputVariable:'recipient',
  conditions:[{field:'Id',operator:'Equals',value:'{!$Record.Customer}'}]}};
 const validity:Node={id:3,type:'Decision',label:'Booking remains active?',config:{
  outcomes:[{name:'Notify',label:'Notify',conditionLogic:'All',conditions:[
   {field:'{!$Record.Status}',operator:'NotEquals',value:'Cancelled'},
   {field:'{!$Record.Status}',operator:'NotEquals',value:'Completed'},
   {field:'{!$Record.Status}',operator:'NotEquals',value:'No Show'},
   ...(internal?[{field:'{!$Record.AssignedTo}',operator:'IsNotNull'}]:[
    {field:'{!recipient}',operator:'IsNotNull'},
    {field:channel==='Email'?'{!recipient.EmailOptIn}':'{!recipient.WhatsAppOptIn}',
     operator:'Equals',value:true}])
  ]}]}};
 const transport:Node=internal
  ?{id:4,type:'Action',label:'Notify assigned operator',config:{
   actionType:'Custom Notification',recipientIds:'{!$Record.AssignedTo}',
   title:'Upcoming appointment',messageBody:'You have an appointment starting in 24 hours.'}}
  :channel==='Email'
  ?{id:4,type:'Action',label:'Send configured appointment email',config:{
   actionType:'Send Email',namedCredentialId:'',fromEmail:'',
   recipients:'{!recipient.Email}',subject:'Appointment reminder',
   body:'Your appointment is scheduled for {!$Record.StartDateTime}. Please contact us to reschedule.'}}
  :{id:4,type:'HTTP Callout',label:'Send approved WhatsApp template',config:{
   namedCredentialId:credentialId??'',path:'v26.0/{!public_phoneNumberId}/messages',
   method:'POST',deliveryMode:'DURABLE_ASYNC',
   onError:'FAULT_PATH',idempotencyKey:'{!$Record.Id}',
   body:'{"messaging_product":"whatsapp","to":"{!recipient.Phone}","type":"template","template":{"name":"CONFIGURE_APPOINTMENT_REMINDER","language":{"code":"en_GB"}}}'}};
 const elements:Node[]=[start,...(internal?[]:[getCustomer]),validity,transport,
  {id:5,type:'End',label:'No reminder',config:{}},end];
 const path:Edge={from:1,to:internal?3:2,kind:'scheduled',label:'24 hours before',
  scheduledPath:{timeSourceFieldApiName:'StartDateTime',offsetAmount:-24,offsetUnit:'Hours'}};
 const connectors=[
  edge(1,7,'Immediate end'),path,
  ...(!internal?[edge(2,3)]:[]),
  edge(3,4,'Notify'),edge(3,5,'Default'),edge(4,7,'Delivered'),
  ...(internal?[edge(4,7,'Notification failed','fault')]:
    channel==='WhatsApp'?[edge(4,7,'Delivery failed','fault')]:[])
 ];
 return {apiName,label:'Ace Assist - '+channel+' upcoming appointment reminder',
  appApiName:'AceAssist',flowType:'Record-Triggered Flow',
  triggerObject:'Appointment',status:internal?'Active':'Draft',version:1,
  startConfig,resources:[],elements,connectors,tests:[]};
}
export const ACEASSIST_REMINDER_FLOW_APIS=[
 'AceAssistAppointmentReminderInternal',
 'AceAssistAppointmentReminderEmail',
 'AceAssistAppointmentReminderWhatsApp'
] as const;
export async function seedAceAssistReminderFlows(client:PoolClient,tenantId:string):Promise<number>{
 let created=0;
 for(const field of [{api:'EmailOptIn',label:'Email Reminders Opt In'},
   {api:'WhatsAppOptIn',label:'WhatsApp Reminders Opt In'}])
  await client.query(`INSERT INTO md_field_definitions
   (tenant_id,object_api,api_name,label,data_type,required,default_value)
   VALUES($1,'Customer',$2,$3,'boolean',false,'false')
   ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,
   [tenantId,field.api,field.label]);
 const {rows:credentials}=await client.query<{id:string}>(`
  SELECT id FROM md_named_credentials WHERE tenant_id=$1
    AND name='WhatsApp_Cloud_API' AND protocol='HTTPS' AND enabled=true
  ORDER BY updated_at DESC, id DESC LIMIT 1`,[tenantId]);
 for(const channel of ['Internal','Email','WhatsApp'] as const){
  const flow=reminderGraph(channel,credentials[0]?.id??null);
  const existing=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
   [tenantId,flow.apiName]);
  if(existing.rowCount)continue;
  const active=channel==='Internal';
  const {rows:added}=await client.query<{id:string}>(`INSERT INTO md_flow_definitions
   (tenant_id,api_name,label,flow_type,version,active)
   VALUES($1,$2,$3,'Record-Triggered Flow',1,$4) RETURNING id`,
   [tenantId,flow.apiName,flow.label,active]);
  const entries:Array<{path:string;kind:string;text:string|null}>=[];
  encodeMetadataValue(flow,'/builder',entries);
  for(const e of entries)await client.query(`
   INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
   VALUES($1,$2,$3,$4,$5)`,[tenantId,added[0].id,e.path,e.kind,e.text]);
  if(active)await syncFlowTriggerSubscription(client,tenantId,flow.apiName,added[0].id,{
   active,flowType:flow.flowType,elements:flow.elements,appApiName:'AceAssist'});
  created++;
 }
 for(const resource of ['Flow:AceAssistAppointmentReminderInternal',
   'Customer.EmailOptIn','Customer.WhatsAppOptIn'])
  await client.query(`INSERT INTO md_permission_rules
   (tenant_id,permission_set_id,resource,action,effect)
   SELECT $1,p.id,$2,$3,'allow' FROM md_permission_sets p
   WHERE p.tenant_id=$1 AND p.api_name='AceAssistUser' ON CONFLICT DO NOTHING`,
   [tenantId,resource,resource.startsWith('Flow:')?'execute':'read']);
 return created;
}
