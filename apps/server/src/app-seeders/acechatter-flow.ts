import type {PoolClient} from 'pg';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import {encodeMetadataValue} from '../system-files/component-runtime.js';

type Field={object:string;name:string;label:string;type:string};
const fields:Field[]=[
 {object:'ChatConversation',name:'Name',label:'Name',type:'text'},
 {object:'ChatConversation',name:'PhoneNumber',label:'Phone Number',type:'phone'},
 {object:'ChatConversation',name:'Status',label:'Status',type:'text'},
 {object:'ChatMessage',name:'Name',label:'Name',type:'text'},
 {object:'ChatMessage',name:'ConversationId',label:'Conversation',type:'reference'},
 {object:'ChatMessage',name:'Body',label:'Body',type:'longtext'},
 {object:'ChatMessage',name:'Direction',label:'Direction',type:'text'},
 {object:'ChatMessage',name:'SentAt',label:'Sent At',type:'datetime'},
 {object:'ChatMessage',name:'Status',label:'Status',type:'text'},
 {object:'ChatMessage',name:'ExternalMessageId',label:'Provider Message ID',type:'text'},
 {object:'ChatChannelSettings',name:'Name',label:'Name',type:'text'},
 {object:'ChatChannelSettings',name:'PhoneNumberId',label:'WhatsApp Phone Number ID',type:'text'},
 {object:'ChatChannelSettings',name:'Active',label:'Active',type:'boolean'}
];
const links=(...ids:number[])=>ids.slice(0,-1).map((from,i)=>({from,to:ids[i+1],kind:'normal',label:'Next'}));
function graph(apiName:string,label:string,object:string,input:string,conditions:unknown[],sortField:string){
 const collection=object==='ChatConversation'?'conversations':'messages';
 return {apiName,label,appApiName:'AceChatter',flowType:'Autolaunched Flow',
  status:'Active',version:1,tests:[],resources:[
   {name:input,type:'Variable',dataType:'Text',availableForInput:true},
   {name:collection,type:'Record Collection',dataType:object,availableForOutput:true}
  ],elements:[
   {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
   {id:2,type:'Get Records',label:'Authorised '+object,config:{
     object,recordLimit:'all',outputVariable:collection,conditions,
     sortField,sortOrder:object==='ChatConversation'?'Ascending':'Ascending'}},
   {id:3,type:'End',label:'End',config:{}}
  ],connectors:links(1,2,3)};
}
async function insertGraph(client:PoolClient,tenantId:string,graphValue:ReturnType<typeof graph>,active:boolean) {
 const existing=await client.query(
  'SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2 LIMIT 1',
  [tenantId,graphValue.apiName]);
 if(existing.rowCount)return false; // Preserve every tenant-authored version.
 const {rows}=await client.query<{id:string}>(`
  INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
  VALUES($1,$2,$3,'Autolaunched Flow',1,$4) RETURNING id`,
  [tenantId,graphValue.apiName,graphValue.label,active]);
 const encoded:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graphValue,'/builder',encoded);
 for(const property of encoded)await client.query(`
  INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
  VALUES($1,$2,$3,$4,$5)`,
  [tenantId,rows[0].id,property.path,property.kind,property.text]);
 return true;
}
/** Idempotently seed only a licensed/installed AceChatter tenant, never user grants or business chats. */
export async function seedAceChatterFlowsForTenant(client:PoolClient,tenantId:string):Promise<number>{
 await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[tenantId+':flows:AceChatter']);
 for(const item of [{name:'ChatConversation',label:'Chat Conversation'},
   {name:'ChatMessage',label:'Chat Message'},
   {name:'ChatChannelSettings',label:'WhatsApp Channel Settings'}])
  await client.query(`INSERT INTO md_object_definitions(tenant_id,api_name,label,is_system)
   VALUES($1,$2,$3,false) ON CONFLICT(tenant_id,api_name) DO NOTHING`,
   [tenantId,item.name,item.label]);
 for(const field of fields)await client.query(`
  INSERT INTO md_field_definitions(tenant_id,object_api,api_name,label,data_type,related_object)
  VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,
  [tenantId,field.object,field.name,field.label,field.type,
   field.name==='ConversationId'?'ChatConversation':null]);
 // Policy exists for explicit administrator assignment; no automatic user grants.
 await client.query(`INSERT INTO md_permission_sets
  (tenant_id,api_name,label,description,navigation_default_access)
  VALUES($1,'AceChatterUser','AceChatter User',
   'Read assigned chats and execute authorised AceChatter Flows','Deny')
  ON CONFLICT(tenant_id,api_name) DO NOTHING`,[tenantId]);
 const rights=[
  ['App:AceChatter','read'],
  ['Flow:AceChatterLoadConversations','execute'],
  ['Flow:AceChatterLoadMessages','execute'],
  ['Flow:AceChatterSendMessage','execute'],
  ['Flow:AceChatterCreateConversation','execute'],
  ['Flow:AceChatterReceiveWebhook','execute'],
  ['ChatConversation','read'],['ChatConversation','create'],
  ['ChatMessage','read'],['ChatMessage','create'],['ChatChannelSettings','read'],
  ...fields.map(field=>[field.object+'.'+field.name,'read'])
 ];
 for(const [resource,action] of rights)await client.query(`
  INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
  SELECT $1,p.id,$2,$3,'allow' FROM md_permission_sets p
  WHERE p.tenant_id=$1 AND p.api_name='AceChatterUser'
  ON CONFLICT DO NOTHING`,[tenantId,resource,action]);
 const definitions=[
  graph('AceChatterLoadConversations','AceChatter - Load Conversations',
   'ChatConversation','searchTerm',[
    {field:'Name',operator:'Contains',value:'@searchTerm'}],'Name'),
  graph('AceChatterLoadMessages','AceChatter - Load Messages',
   'ChatMessage','conversationId',[
    {field:'ConversationId',operator:'Equals',value:'@conversationId'}],'SentAt')
 ];
 let seeded=0;
 for(const value of definitions)if(await insertGraph(client,tenantId,value,true))seeded++;
 const createChat={
  apiName:'AceChatterCreateConversation',label:'AceChatter - New Conversation',
  appApiName:'AceChatter',flowType:'Autolaunched Flow',status:'Active',version:1,tests:[],
  resources:[
   {name:'chatName',type:'Variable',dataType:'Text',availableForInput:true},
   {name:'phoneNumber',type:'Variable',dataType:'Text',availableForInput:true}
  ],elements:[
   {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
   {id:2,type:'Get Records',label:'Find existing phone',config:{
    object:'ChatConversation',recordLimit:'1',outputVariable:'existing',
    conditions:[{field:'PhoneNumber',operator:'Equals',value:'@phoneNumber'}]}},
   {id:3,type:'Decision',label:'New phone?',config:{outcomes:[
    {name:'New',label:'New',conditions:[{field:'@existing',operator:'Is Null'}]},
    {name:'Default',label:'Default'}]}},
   {id:4,type:'Create Records',label:'Create conversation',config:{
    object:'ChatConversation',fieldValues:[
     {field:'Name',value:'@chatName'},{field:'PhoneNumber',value:'@phoneNumber'},
     {field:'Status',value:'Open'}]}},
   {id:5,type:'End',label:'End',config:{}}
  ],connectors:[
   ...links(1,2,3),{from:3,to:4,kind:'normal',label:'New'},
   {from:3,to:5,kind:'normal',label:'Default'},...links(4,5)]
 };
 if(await insertGraph(client,tenantId,createChat as ReturnType<typeof graph>,true))seeded++;
 const receive={
  apiName:'AceChatterReceiveWebhook',label:'AceChatter - Receive WhatsApp Webhook',
  appApiName:'AceChatter',flowType:'Autolaunched Flow',status:'Active',version:1,tests:[],
  resources:[
   {name:'webhookPayloadJson',type:'Variable',dataType:'Text',availableForInput:true},
   {name:'requestId',type:'Variable',dataType:'Text',availableForInput:true}
  ],elements:[
   {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
   {id:2,type:'Parse JSON',label:'Extract verified WhatsApp text',config:{
    source:'@webhookPayloadJson',assignments:[
     {path:'entry[0].changes[0].value.messages[0].id',outputVariable:'providerMessageId'},
     {path:'entry[0].changes[0].value.messages[0].from',outputVariable:'fromPhone'},
     {path:'entry[0].changes[0].value.messages[0].text.body',outputVariable:'messageBody'},
     {path:'entry[0].changes[0].value.contacts[0].profile.name',outputVariable:'contactName'},
     {path:'entry[0].changes[0].value.statuses[0].id',outputVariable:'statusMessageId'},
     {path:'entry[0].changes[0].value.statuses[0].status',outputVariable:'deliveryStatus'}
    ]}},
   {id:3,type:'Decision',label:'Message or receipt?',config:{outcomes:[
    {name:'Message',label:'Message',conditions:[{field:'@providerMessageId',operator:'Is Not Null'}]},
    {name:'Receipt',label:'Receipt',conditions:[{field:'@statusMessageId',operator:'Is Not Null'}]},
    {name:'Default',label:'Default'}]}},
   {id:4,type:'Get Records',label:'Find existing message',config:{
    object:'ChatMessage',recordLimit:'1',outputVariable:'previousMessage',
    conditions:[{field:'ExternalMessageId',operator:'Equals',value:'@providerMessageId'}]}},
   {id:5,type:'Decision',label:'Unseen message?',config:{outcomes:[
    {name:'New',label:'New',conditions:[{field:'@previousMessage',operator:'Is Null'}]},
    {name:'Default',label:'Default'}]}},
   {id:6,type:'Get Records',label:'Find sender conversation',config:{
    object:'ChatConversation',recordLimit:'1',outputVariable:'existingConversation',
    conditions:[{field:'PhoneNumber',operator:'Equals',value:'@fromPhone'}]}},
   {id:7,type:'Decision',label:'New sender?',config:{outcomes:[
    {name:'New',label:'New',conditions:[{field:'@existingConversation',operator:'Is Null'}]},
    {name:'Default',label:'Default'}]}},
   {id:8,type:'Create Records',label:'Create sender',config:{
    object:'ChatConversation',fieldValues:[
     {field:'Name',value:'@contactName'},{field:'PhoneNumber',value:'@fromPhone'},
     {field:'Status',value:'Open'}]}},
   {id:9,type:'Get Records',label:'Resolve conversation',config:{
    object:'ChatConversation',recordLimit:'1',outputVariable:'conversation',
    conditions:[{field:'PhoneNumber',operator:'Equals',value:'@fromPhone'}]}},
   {id:10,type:'Create Records',label:'Save inbound text',config:{
    object:'ChatMessage',fieldValues:[
     {field:'Name',value:'WhatsApp inbound'},
     {field:'ConversationId',value:'@conversation.Id'},
     {field:'ExternalMessageId',value:'@providerMessageId'},
     {field:'Body',value:'@messageBody'},
     {field:'Direction',value:'Inbound'},{field:'Status',value:'Received'}]}},
   {id:11,type:'Get Records',label:'Find receipt message',config:{
    object:'ChatMessage',recordLimit:'1',outputVariable:'receiptMessage',
    conditions:[{field:'ExternalMessageId',operator:'Equals',value:'@statusMessageId'}]}},
   {id:12,type:'Decision',label:'Receipt matching?',config:{outcomes:[
    {name:'Found',label:'Found',conditions:[{field:'@receiptMessage',operator:'Is Not Null'}]},
    {name:'Default',label:'Default'}]}},
   {id:13,type:'Update Records',label:'Set delivery status',config:{
    object:'ChatMessage',recordSource:'record',recordVariable:'receiptMessage',
    fieldValues:[{field:'Status',value:'@deliveryStatus'}]}},
   {id:14,type:'End',label:'End',config:{}}
  ],connectors:[
   ...links(1,2,3),{from:3,to:4,kind:'normal',label:'Message'},
   {from:3,to:11,kind:'normal',label:'Receipt'},
   {from:3,to:14,kind:'normal',label:'Default'},
   ...links(4,5),{from:5,to:6,kind:'normal',label:'New'},
   {from:5,to:14,kind:'normal',label:'Default'},
   ...links(6,7),{from:7,to:8,kind:'normal',label:'New'},
   {from:7,to:9,kind:'normal',label:'Default'},
   ...links(8,9,10,14),...links(11,12),
   {from:12,to:13,kind:'normal',label:'Found'},
   {from:12,to:14,kind:'normal',label:'Default'},...links(13,14)
  ]
 };
 if(await insertGraph(client,tenantId,receive as ReturnType<typeof graph>,true))seeded++;
 // Never activate a fake send: the tenant must author and connect a provider
 // Named Credential / callout first. Keep the editable Flow safely Draft.
 const sendDraft={
  apiName:'AceChatterSendMessage',label:'AceChatter - Send Message',
  appApiName:'AceChatter',flowType:'Autolaunched Flow',
  status:'Draft',version:1,tests:[],
  resources:[
   {name:'conversationId',type:'Variable',dataType:'Text',availableForInput:true},
   {name:'message',type:'Variable',dataType:'Text',availableForInput:true},
   {name:'recipientPhone',type:'Variable',dataType:'Text',availableForInput:true},
   {name:'phoneNumberId',type:'Variable',dataType:'Text',availableForInput:true},
   {name:'providerMessageId',type:'Variable',dataType:'Text'}
  ],
  elements:[
   {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
   {id:4,type:'Get Records',label:'Authorised WhatsApp recipient',config:{
     object:'ChatConversation',recordLimit:'1',outputVariable:'conversation',
     conditions:[{field:'Id',operator:'Equals',value:'@conversationId'}]}},
   {id:2,type:'HTTP Callout',label:'Configure WhatsApp Named Credential',config:{
     method:'POST',path:'v26.0/{!public_phoneNumberId}/messages',
     body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',
       to:'{!conversation.PhoneNumber}',type:'text',text:{preview_url:false,body:'{!message}'}}),
     onError:'FAIL',responseMapping:JSON.stringify({providerMessageId:'messages[0].id'})}},
   {id:6,type:'Create Records',label:'Record accepted WhatsApp message',config:{
     object:'ChatMessage',fieldValues:[
      {field:'Name',value:'WhatsApp outbound'},
      {field:'ConversationId',value:'@conversation.Id'},
      {field:'Body',value:'@message'},{field:'Direction',value:'Outbound'},
      {field:'Status',value:'Accepted'},{field:'ExternalMessageId',value:'@providerMessageId'}]}},
   {id:3,type:'End',label:'End',config:{}}
  ],connectors:links(1,4,2,6,3)
 };
 if(await insertGraph(client,tenantId,sendDraft as ReturnType<typeof graph>,false))seeded++;
 return seeded;
}
export async function seedAceChatterFlows(db:SqlPersistence):Promise<number>{
 const {rows}=await db.query<{tenant_id:string}>(`
  SELECT DISTINCT i.tenant_id FROM md_app_installations i
  JOIN md_apps a ON a.id=i.app_id AND a.api_name='AceChatter' AND a.enabled=true
  JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=i.tenant_id
  WHERE e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())`);
 let count=0;
 for(const row of rows)count+=await db.transaction(c=>seedAceChatterFlowsForTenant(c,row.tenant_id));
 return count;
}
