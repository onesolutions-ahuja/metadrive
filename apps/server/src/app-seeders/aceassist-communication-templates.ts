import type {PoolClient} from 'pg';
import {encodeMetadataValue} from '../system-files/component-runtime.js';

/** Transport bindings are tenant secrets, never app seed data.
 * All templates are intentionally inactive drafts until a tenant developer
 * selects a permitted Named Credential, configures a verified recipient and publishes.
 */
function sendTemplate(object:'Quotation'|'Invoice',credentialId:string|null){
 const apiName='AceAssistSend'+object+'WhatsApp';
 const get={id:2,type:'Get Records',label:'Read authorised '+object,config:{
  object,recordLimit:'1',outputVariable:'document',
  conditions:[{field:'Id',operator:'Equals',value:'{!recordId}'}]}};
 const customer={id:3,type:'Get Records',label:'Read authorised recipient',config:{
  object:'Customer',recordLimit:'1',outputVariable:'customer',
  conditions:[{field:'Id',operator:'Equals',value:'{!document.Customer}'}]}};
 const check={id:4,type:'Decision',label:'Document and recipient exist?',config:{outcomes:[
  {name:'Found',label:'Found',conditionLogic:'All',conditions:[
   {field:'{!document}',operator:'IsNotNull'},
   {field:'{!customer}',operator:'IsNotNull'}]}]}};
 const transport={id:5,type:'HTTP Callout',label:'Send approved WhatsApp template',config:{
   method:'POST',namedCredentialId:credentialId??'',
   path:'v26.0/{!public_phoneNumberId}/messages',deliveryMode:'DURABLE_ASYNC',
   onError:'FAULT_PATH',idempotencyKey:'{!recordId}',
   body:'{"messaging_product":"whatsapp","to":"{!customer.Phone}","type":"template","template":{"name":"CONFIGURE_APPROVED_TEMPLATE","language":{"code":"en_GB"}}}' }}
 return {apiName,label:'Ace Assist - WhatsApp '+object,appApiName:'AceAssist',
  flowType:'Autolaunched Flow',status:'Draft',version:1,tests:[],
  resources:[{name:'recordId',type:'Variable',dataType:'Text',availableForInput:true}],
  elements:[
   {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},get,customer,check,transport,
   {id:6,type:'Custom Error',label:'Missing document or customer',config:{
    errorLocation:'Page',errorMessage:'Document or recipient is unavailable to this user.'}},
   {id:7,type:'End',label:'End',config:{}}],
  connectors:[
   {from:1,to:2,kind:'normal',label:'Next'},
   {from:2,to:3,kind:'normal',label:'Next'},
   {from:3,to:4,kind:'normal',label:'Next'},
   {from:4,to:5,kind:'normal',label:'Found'},
   {from:4,to:6,kind:'normal',label:'Default'},
   {from:5,to:7,kind:'normal',label:'Sent'},
   {from:5,to:7,kind:'fault',label:'Delivery fault'}
  ]};
}
export const ACEASSIST_COMMUNICATION_TEMPLATE_APIS=[
 'AceAssistSendQuotationWhatsApp','AceAssistSendInvoiceWhatsApp'
] as const;
export async function seedAceAssistCommunicationTemplates(client:PoolClient,tenantId:string):Promise<number>{
 let created=0;
 const {rows:credentials}=await client.query<{id:string}>(`
  SELECT id FROM md_named_credentials WHERE tenant_id=$1
   AND name='WhatsApp_Cloud_API' AND protocol='HTTPS' AND enabled=true
  ORDER BY updated_at DESC, id DESC LIMIT 1`,[tenantId]);
 for(const object of ['Quotation','Invoice'] as const){
   const graph=sendTemplate(object,credentials[0]?.id??null);
   const found=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
    [tenantId,graph.apiName]);
   if(found.rowCount)continue;
   const {rows}=await client.query<{id:string}>(`INSERT INTO md_flow_definitions
    (tenant_id,api_name,label,flow_type,version,active)
    VALUES($1,$2,$3,'Autolaunched Flow',1,false) RETURNING id`,
    [tenantId,graph.apiName,graph.label]);
   const values:Array<{path:string;kind:string;text:string|null}>=[];
   encodeMetadataValue(graph,'/builder',values);
   for(const x of values)await client.query(`
    INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
    VALUES($1,$2,$3,$4,$5)`,[tenantId,rows[0].id,x.path,x.kind,x.text]);
   created++;
  }
 return created;
}
