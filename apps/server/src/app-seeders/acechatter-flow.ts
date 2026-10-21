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
 {object:'ChatMessage',name:'Status',label:'Status',type:'text'}
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
   {name:'ChatMessage',label:'Chat Message'}])
  await client.query(`INSERT INTO md_object_definitions(tenant_id,api_name,label,is_system)
   VALUES($1,$2,$3,false) ON CONFLICT(tenant_id,api_name) DO NOTHING`,
   [tenantId,item.name,item.label]);
 for(const field of fields)await client.query(`
  INSERT INTO md_field_definitions(tenant_id,object_api,api_name,label,data_type,related_object)
  VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,
  [tenantId,field.object,field.name,field.label,field.type,
   field.name==='ConversationId'?'ChatConversation':null]);
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
