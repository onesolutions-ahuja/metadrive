import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reconcileAceChatterCommunicationFlow,reconcileAceChatterCreateConversationContactFields,reconcileAceChatterCredentialFlow,reconcileAceChatterLoadCommunicationsFlow,seedAceChatterFlowsForTenant} from '../../src/app-seeders/acechatter-flow.js';
import {decodeMetadataValues,encodeMetadataValue} from '../../src/system-files/component-runtime.js';
import {executeHttpCalloutNode} from '../../src/system-files/nodes/HttpCalloutNode.js';
import {executeCreateRecordsNode} from '../../src/system-files/nodes/CreateRecordsNode.js';
import {executeParseJsonNode} from '../../src/system-files/nodes/ParseJsonNode.js';
import {bindPublicHttpCredentialVariables,prepareFlowHttpRequest} from '../../src/system-files/flow-http-mapping.js';

test('AceChatter app seeding is tenant-scoped, idempotent and preserves business data',async()=>{
 const seen:Array<{sql:string;params:unknown[]}>=[],flows=new Set<string>();
 const graphValues=new Map<string,Array<{property_path:string;value_kind:string;value_text:string|null}>>();
 let graphRows=0;
 const client={query:async(sql:string,params:unknown[]=[])=>{
  seen.push({sql,params});
  if(sql.includes('FROM md_object_definitions')&&sql.includes('api_name=$2'))return {rows:[{exists:true}],rowCount:1};
  if(sql.includes('SELECT 1 FROM md_flow_definitions')){
    const name=String(params[1]);return {rows:flows.has(name)?[{exists:true}]:[],rowCount:flows.has(name)?1:0};
  }
  if(sql.includes('INSERT INTO md_flow_definitions')){
    const name=String(params[1]);flows.add(name);
    return {rows:[{id:'flow-'+name}],rowCount:1};
  }
  if(sql.includes('INSERT INTO md_flow_editor_values')){
   graphRows++;
   const flowId=String(params[1]);
   const values=graphValues.get(flowId)??[];
   values.push({property_path:String(params[2]),value_kind:String(params[3]),
    value_text:params[4]===null?null:String(params[4])});
   graphValues.set(flowId,values);
  }
  return {rows:[],rowCount:1};
 }} as never;
 const first=await seedAceChatterFlowsForTenant(client,'tenant-a');
 assert.equal(first,8);
 assert.equal(graphRows>0,true);
 assert.equal(flows.has('AceChatterLoadConversations'),true);
 assert.equal(flows.has('AceChatterLoadMessages'),true);
 assert.equal(flows.has('AceChatterLoadContacts'),true);
 assert.equal(flows.has('AceChatterLoadCommunications'),true);
 assert.equal(flows.has('AceChatterFindConversationByPhone'),true);
 assert.equal(flows.has('AceChatterSendMessage'),true);
 assert.equal(flows.has('AceChatterReceiveWebhook'),true);
 assert.equal(flows.has('AceChatterCreateConversation'),true);
 const contactsGraph=decodeMetadataValues(
  graphValues.get('flow-AceChatterLoadContacts')??[]).builder as {
   resources:Array<{name:string;type:string;availableForOutput?:boolean}>;
   elements:Array<{type:string;config:Record<string,unknown>}>;
  };
 const getContacts=contactsGraph.elements.find(node=>node.type==='Get Records');
 assert.equal(getContacts?.config.object,'Contact');
 assert.equal(getContacts?.config.outputVariable,'contacts');
 assert.deepEqual(getContacts?.config.conditions,[
  {field:'OwnerId',operator:'Equals',value:'{!$User.Id}'},
  {field:'Name',operator:'Contains',value:'@searchTerm'}
 ]);
 assert.equal(contactsGraph.resources.some(resource=>resource.name==='contacts'
  &&resource.type==='Record Collection'&&resource.availableForOutput===true),true);
 assert.equal(contactsGraph.resources.some(resource=>resource.name==='sourceObjectApi'
  &&resource.availableForOutput===true),true);
 assert.equal(contactsGraph.elements.find(node=>node.type==='Assignment')?.config.value,'Contact');
 const communicationGraph=decodeMetadataValues(
  graphValues.get('flow-AceChatterLoadCommunications')??[]).builder as {
   elements:Array<{type:string;config:Record<string,unknown>}>;
  };
 const getCommunications=communicationGraph.elements.find(node=>node.type==='Get Records');
 assert.equal(getCommunications?.config.object,'Communication');
 assert.equal(getCommunications?.config.outputVariable,'communications');
 assert.equal(getCommunications?.config.recordLimit,'200');
 assert.deepEqual(getCommunications?.config.conditions,[
  {field:'Channel',operator:'Equals',value:'WhatsApp'},
  {field:'Sender',operator:'Contains',value:'@searchTerm'},
  {field:'Recipient',operator:'Contains',value:'@searchTerm'}
 ]);
 assert.equal(getCommunications?.config.sortField,'ReceivedAt');
 assert.equal(getCommunications?.config.conditionLogic,'1 AND (2 OR 3)');
 const sendGraph=decodeMetadataValues(
  graphValues.get('flow-AceChatterSendMessage')??[]).builder as {
   elements:Array<{id:number;type:string;config:Record<string,unknown>}>;
  };
 const outboundCallout=sendGraph.elements.find(node=>node.id===2);
 assert.equal(outboundCallout?.type,'HTTP Callout');
 assert.deepEqual(outboundCallout?.config.communicationLog,{
  channel:'WhatsApp',name:'WhatsApp outbound',sender:'WhatsApp Business',
  recipient:'{!conversation.PhoneNumber}',body:'{!message}',provider:'WhatsApp',
  externalMessageIdResponsePath:'messages[0].id'
 });
 assert.equal(sendGraph.elements.some(node=>node.type==='Create Records'
  &&node.config.object==='Communication'),false,
  'the Flow must not create a duplicate Communication record');
 const resolverGraph=decodeMetadataValues(
  graphValues.get('flow-AceChatterFindConversationByPhone')??[]).builder as {
   elements:Array<{type:string;config:Record<string,unknown>}>;
  };
 const resolveNode=resolverGraph.elements.find(node=>node.type==='Get Records');
 assert.equal(resolveNode?.config.object,'ChatConversation');
 assert.equal(resolveNode?.config.recordLimit,'200');
 assert.deepEqual(resolveNode?.config.conditions,[
  {field:'PhoneNumber',operator:'Equals',value:'@phoneNumber'}
 ]);
 const before=graphRows;
 const second=await seedAceChatterFlowsForTenant(client,'tenant-a');
 assert.equal(second,0);
 assert.equal(graphRows,before);
 assert.equal(seen.every(call=>!call.sql.includes('INSERT INTO md_records') &&
   !call.sql.includes('INSERT INTO md_permission_assignments')),true);
 const created=seen.filter(call=>call.sql.includes('INSERT INTO md_flow_definitions'));
 assert.equal(created.find(call=>call.params[1]==='AceChatterSendMessage')?.params[3],false,
  'WhatsApp delivery must remain disabled until provider credentials are configured');
 assert.equal(created.filter(call=>call.params[3]===true).length,7);
 assert.equal(seen.some(call=>call.sql.includes('INSERT INTO md_permission_rules')
  &&call.params[1]==='Communication'&&call.params[2]==='create'),true,
  'inbound WhatsApp message ingestion needs explicit OneEngine Communication create permission');
 assert.equal(seen.some(call=>call.sql.includes('INSERT INTO md_permission_rules')
  &&call.params[1]==='Communication'&&call.params[2]==='read'),true,
  'AceChatter users need explicit OneEngine read permission for Communication records');
 assert.equal(seen.some(call=>call.sql.includes('INSERT INTO md_permission_rules')
  &&call.params[1]==='Communication.Sender'&&call.params[2]==='read'),true,
  'the Flow needs field-level read permission for sender-number filtering');
 assert.equal(seen.some(call=>call.sql.includes('INSERT INTO md_permission_rules')
  &&call.sql.includes("p.api_name='OneEngine'")
  &&call.params[1]==='Flow:AceChatterLoadCommunications'&&call.params[2]==='execute'),true,
  'OneEngine should have the default execute grant for the Communication inbox Flow');
 assert.equal(seen.some(call=>call.sql.includes('INSERT INTO md_permission_rules')
  &&call.sql.includes("p.api_name='OneEngine'")
  &&call.params[1]==='Communication'&&call.params[2]==='read'),true,
  'OneEngine should have the default read grant for Communication records');
 assert.equal(seen.some(call=>call.sql.includes('INSERT INTO md_permission_assignments')
  ||call.sql.includes('INSERT INTO md_role_permission_sets')),false,
  'the app seeder must not assign OneEngine to users or roles');
});

test('reconcile known AceChatter send Flow to central Communication logging without changing its callout',async()=>{
 const credential='caaefd14-fe71-4d4c-81de-14b3d1704897';
 const old={
  apiName:'AceChatterSendMessage',status:'Active',resources:[],
  elements:[
   {id:1,type:'Start',config:{}},
   {id:4,type:'Get Records',config:{object:'ChatConversation',recordLimit:'1',outputVariable:'conversation',
    conditions:[{field:'Id',operator:'Equals',value:'@conversationId'}]}},
   {id:2,type:'HTTP Callout',config:{namedCredentialId:credential,
    path:'v26.0/{!public_phoneNumberId}/messages',method:'POST'}},
   {id:6,type:'Create Records',config:{object:'ChatMessage',fieldValues:[
    {field:'Body',value:'@message'},{field:'ExternalMessageId',value:'@providerMessageId'}]}},
   {id:7,type:'Create Records',label:'Record outbound Communication',config:{object:'Communication',fieldValues:[
    {field:'Name',value:'WhatsApp outbound'},{field:'Channel',value:'WhatsApp'},
    {field:'Direction',value:'Outbound'},{field:'Status',value:'Sent'},
    {field:'Sender',value:'WhatsApp Business'},{field:'Recipient',value:'@conversation.PhoneNumber'},
    {field:'Body',value:'@message'},{field:'ExternalMessageId',value:'@providerMessageId'},
    {field:'Provider',value:'WhatsApp'}]}},
   {id:3,type:'End',config:{}}
  ],connectors:[
   {from:1,to:4,kind:'normal'},{from:4,to:2,kind:'normal'},
   {from:2,to:6,kind:'normal'},{from:6,to:7,kind:'normal'},
   {from:7,to:3,kind:'normal'}
  ]
 };
 const initial:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(old,'/builder',initial);
 let stored=initial.map(item=>({property_path:item.path,value_kind:item.kind,value_text:item.text}));
 let audits=0,deletions=0;
 const client={query:async(sql:string,params:unknown[]=[])=>{
  if(sql.includes('SELECT id FROM md_flow_definitions'))
   return {rows:[{id:'flow-id'}],rowCount:1};
  if(sql.includes('SELECT property_path,value_kind,value_text'))
   return {rows:stored,rowCount:stored.length};
  if(sql.startsWith('DELETE FROM md_flow_editor_values')){
   stored=[];deletions++;return {rows:[],rowCount:0};
  }
  if(sql.includes('INSERT INTO md_flow_editor_values')){
   stored.push({property_path:String(params[2]),value_kind:String(params[3]),
    value_text:params[4]===null?null:String(params[4])});
  }
  if(sql.includes('INSERT INTO md_security_events'))audits++;
  return {rows:[],rowCount:1};
 }} as never;
 assert.equal(await reconcileAceChatterCommunicationFlow(client,'tenant-a'),true);
 const current=decodeMetadataValues(stored).builder as typeof old & {
  elements:Array<{id:number;type:string;config:Record<string,unknown>}>;
  connectors:Array<{from:number;to:number}>;
 };
 const callout=current.elements.find(element=>element.id===2);
 assert.equal(callout?.config.namedCredentialId,credential);
 assert.equal(callout?.config.path,'v26.0/{!public_phoneNumberId}/messages');
 const communication=current.elements.find(element=>element.type==='Create Records'
  &&element.config.object==='Communication');
 assert.equal(communication,undefined,'central callout logging must replace the Flow Communication node');
 assert.deepEqual(callout?.config.communicationLog,{
  channel:'WhatsApp',name:'WhatsApp outbound',sender:'WhatsApp Business',
  recipient:'{!conversation.PhoneNumber}',body:'{!message}',provider:'WhatsApp',
  externalMessageIdResponsePath:'messages[0].id'
 });
 assert.equal(current.connectors.some(edge=>edge.from===6&&edge.to===3),true);
 assert.equal(current.connectors.some(edge=>edge.from===6&&edge.to===7),false);
 assert.equal(current.connectors.some(edge=>edge.from===7&&edge.to===3),false);
 assert.equal(await reconcileAceChatterCommunicationFlow(client,'tenant-a'),false);
 assert.equal(deletions,1);
 assert.equal(audits,1);
});

test('reconcile AceChatter sender Flow from Named Credential without overwriting tenant configuration',async()=>{
 const credential='caaefd14-fe71-4d4c-81de-14b3d1704897';
 const old={
  apiName:'AceChatterSendMessage',status:'Draft',resources:[],
  elements:[
   {id:1,type:'Start',config:{}},
   {id:2,type:'HTTP Callout',config:{
    namedCredentialId:credential,path:'v26.0/{!public_phoneNumberId}/messages',
    body:'{"to":"{!conversation.PhoneNumber}"}',responseMapping:'{"providerMessageId":"messages[0].id"}'}},
   {id:3,type:'End',config:{}},
   {id:4,type:'Get Records',config:{object:'ChatConversation',outputVariable:'conversation'}},
   {id:5,type:'Get Records',config:{object:'ChatChannelSettings',outputVariable:'channel'}},
   {id:6,type:'Create Records',config:{object:'ChatMessage',fieldValues:[]}}
  ],connectors:[
   {from:1,to:4,kind:'normal'}, {from:2,to:6,kind:'normal'},
   {from:4,to:5,kind:'normal'}, {from:5,to:2,kind:'normal'},
   {from:6,to:3,kind:'normal'}]
 };
 const initial:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(old,'/builder',initial);
 let stored=initial.map(item=>({
  property_path:item.path,value_kind:item.kind,value_text:item.text
 }));
 let audits=0,deletions=0;
 const client={query:async(sql:string,params:unknown[]=[])=>{
  if(sql.includes('SELECT id FROM md_flow_definitions'))
   return {rows:[{id:'flow-id'}],rowCount:1};
  if(sql.includes('SELECT property_path,value_kind,value_text'))
   return {rows:stored,rowCount:stored.length};
  if(sql.startsWith('DELETE FROM md_flow_editor_values')){
   stored=[];deletions++;return {rows:[],rowCount:0};
  }
  if(sql.includes('INSERT INTO md_flow_editor_values')){
   stored.push({property_path:String(params[2]),value_kind:String(params[3]),
    value_text:params[4]===null?null:String(params[4])});
  }
  if(sql.includes('INSERT INTO md_security_events'))audits++;
  return {rows:[],rowCount:1};
 }} as never;
 assert.equal(await reconcileAceChatterCredentialFlow(client,'tenant-a'),true);
 const current=decodeMetadataValues(stored).builder as typeof old;
 assert.equal(current.elements.some(element=>element.id===5),false);
 assert.equal(current.connectors.some(edge=>edge.from===4&&edge.to===2),true);
 assert.equal(current.connectors.some(edge=>edge.from===5||edge.to===5),false);
 const sendNode=current.elements.find(element=>element.id===2) as
   {config:Record<string,unknown>}|undefined;
 assert.equal(sendNode?.config.namedCredentialId,credential);
 assert.equal(sendNode?.config.path,'v26.0/{!public_phoneNumberId}/messages');
 assert.equal(await reconcileAceChatterCredentialFlow(client,'tenant-a'),false);
 assert.equal(deletions,1);
 assert.equal(audits,1);
});

test('AceChatter outbound accepts provider message ID before saving, and refuses failed sends',async()=>{
 const rows:Array<Record<string,unknown>>=[];
 const vars:Record<string,unknown>={
  conversation:{Id:'00000000-0000-4000-8000-000000000007',PhoneNumber:'447700900123'},
  message:'Test from AceChatter',providerMessageId:null,
  public_phoneNumberId:'spoofed-from-client'
 };
 const evaluate=(value:unknown):unknown=>{
  if(typeof value!=='string'||!value.startsWith('@'))return value;
  const parts=value.slice(1).split('.');
  let current:unknown=vars[parts.shift()!];
  for(const part of parts)current=current&&typeof current==='object'
   ?(current as Record<string,unknown>)[part]:null;
  return current??null;
 };
 const resources=[{name:'providerMessageId',type:'Variable',dataType:'Text'}];
 const config={
  path:'v26.0/{!public_phoneNumberId}/messages',
  body:'{"messaging_product":"whatsapp","to":"{!conversation.PhoneNumber}","type":"text","text":{"body":"{!message}"}}',
  responseMapping:'{"providerMessageId":"messages[0].id"}',method:'POST',onError:'FAIL'
 };
 const create=async()=>{
  await executeCreateRecordsNode({
   tenantId:'tenant',userId:'actor',client:{} as never,
   node:{id:6,type:'Create Records',config:{
    object:'ChatMessage',fieldValues:[
     {field:'ConversationId',value:'@conversation.Id'},
     {field:'Body',value:'@message'},{field:'Direction',value:'Outbound'},
     {field:'Status',value:'Accepted'},{field:'ExternalMessageId',value:'@providerMessageId'}
    ]}},
   vars,evaluate,set:(name:unknown,value:unknown)=>{vars[String(name)]=value;},
   records:{createInTransaction:async(_c:unknown,_t:string,_u:string,_o:string,fields:Record<string,unknown>)=>{
    rows.push(fields);return 'message-record-id';
   }},
   scalar:(value:unknown)=>value===null||['string','number','boolean'].includes(typeof value)
  } as never);
 };
 await assert.rejects(()=>executeHttpCalloutNode({
  tenantId:'tenant',userId:'actor',client:{} as never,runId:'run',current:2,
  node:{id:2,config},vars,evaluate,
  set:(name:unknown,value:unknown)=>{vars[String(name)]=value;},resources,
  transport:async()=>{throw new Error('Provider rejected request');}
 }),/Provider rejected request/);
 assert.equal(rows.length,0,'failed sends must not create accepted messages');
 await executeHttpCalloutNode({
  tenantId:'tenant',userId:'actor',client:{} as never,runId:'run',current:2,
  node:{id:2,config},vars,evaluate,
  set:(name:unknown,value:unknown)=>{vars[String(name)]=value;},resources,
  transport:async(_tenant,_actor,request,values)=>{
   const safe=bindPublicHttpCredentialVariables(values,
    {public_phoneNumberId:'1234567890123'},[request.path,request.body]);
   const prepared=prepareFlowHttpRequest(request,safe);
   assert.equal(prepared.path,'v26.0/1234567890123/messages');
   assert.deepEqual(JSON.parse(prepared.body??''),{
    messaging_product:'whatsapp',to:'447700900123',
    type:'text',text:{body:'Test from AceChatter'}
   });
   return {status:200,body:'{"messages":[{"id":"wamid.accepted"}]}'};
  }
 });
 assert.equal(vars.providerMessageId,'wamid.accepted');
 await create();
 assert.deepEqual(rows,[{
  ConversationId:'00000000-0000-4000-8000-000000000007',
  Body:'Test from AceChatter',Direction:'Outbound',
  Status:'Accepted',ExternalMessageId:'wamid.accepted'
 }]);
});

test('AceChatter inbound signed payload parsing produces an inbound ChatMessage mapping',async()=>{
 const payload={entry:[{changes:[{value:{
  messages:[{id:'wamid.inbound',from:'447700900123',text:{body:'Reply'}}],
  contacts:[{profile:{name:'Test Customer'}}]
 }}]}]};
 const vars:Record<string,unknown>={webhookPayloadJson:JSON.stringify(payload)};
 executeParseJsonNode({vars,node:{id:2,type:'Parse JSON',config:{
  source:'@webhookPayloadJson',assignments:[
   {path:'entry[0].changes[0].value.messages[0].id',outputVariable:'providerMessageId'},
   {path:'entry[0].changes[0].value.messages[0].from',outputVariable:'fromPhone'},
   {path:'entry[0].changes[0].value.messages[0].text.body',outputVariable:'messageBody'}
  ]}},evaluate:(value:unknown)=>value==='@webhookPayloadJson'?vars.webhookPayloadJson:value} as never);
 assert.deepEqual({
  id:vars.providerMessageId,phone:vars.fromPhone,body:vars.messageBody,
  direction:'Inbound',status:'Received'
 },{id:'wamid.inbound',phone:'447700900123',body:'Reply',
   direction:'Inbound',status:'Received'});
 vars.conversation={Id:'00000000-0000-4000-8000-000000000007'};
 const written:Array<Record<string,unknown>>=[];
 await executeCreateRecordsNode({
  tenantId:'tenant',userId:'actor',client:{} as never,vars,
  node:{id:10,type:'Create Records',config:{object:'ChatMessage',fieldValues:[
   {field:'ConversationId',value:'@conversation.Id'},
   {field:'ExternalMessageId',value:'@providerMessageId'},
   {field:'Body',value:'@messageBody'},{field:'Direction',value:'Inbound'},
   {field:'Status',value:'Received'}]}},
  evaluate:(value:unknown)=>{
   if(value==='@conversation.Id')return (vars.conversation as {Id:string}).Id;
   if(typeof value==='string'&&value.startsWith('@'))return vars[value.slice(1)];
   return value;
  },
  set:()=>undefined,
  records:{createInTransaction:async(_client:unknown,_tenant:string,
   _actor:string,_object:string,fields:Record<string,unknown>)=>{
   written.push(fields);return 'inbound-record-id';
  }},
  scalar:(value:unknown)=>value===null||['string','number','boolean'].includes(typeof value)
 } as never);
 assert.deepEqual(written,[{ConversationId:'00000000-0000-4000-8000-000000000007',
  ExternalMessageId:'wamid.inbound',Body:'Reply',Direction:'Inbound',Status:'Received'}]);
});

test('reconcile seeded New Chat Flow adds source contact link without overwriting custom Flows',async()=>{
 const graph={
  apiName:'AceChatterCreateConversation',status:'Active',resources:[
   {name:'chatName',type:'Variable',dataType:'Text',availableForInput:true},
   {name:'phoneNumber',type:'Variable',dataType:'Text',availableForInput:true}
  ],elements:[
   {id:1,type:'Start',config:{}},
   {id:2,type:'Get Records',config:{object:'ChatConversation',recordLimit:'1',
    outputVariable:'existing',conditions:[{field:'PhoneNumber',operator:'Equals',value:'@phoneNumber'}]}},
   {id:3,type:'Decision',config:{outcomes:[
    {name:'New',label:'New',conditions:[{field:'@existing',operator:'Is Null'}]},
    {name:'Default',label:'Default'}]}},
   {id:4,type:'Create Records',config:{object:'ChatConversation',fieldValues:[
    {field:'Name',value:'@chatName'},{field:'PhoneNumber',value:'@phoneNumber'},
    {field:'Status',value:'Open'}]}},
   {id:5,type:'End',config:{}}
  ],connectors:[
   {from:1,to:2,kind:'normal',label:'Next'},{from:2,to:3,kind:'normal',label:'Next'},
   {from:3,to:4,kind:'normal',label:'New'},{from:3,to:5,kind:'normal',label:'Default'},
   {from:4,to:5,kind:'normal',label:'Next'}]
 };
 const initial:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graph,'/builder',initial);
 let stored=initial.map(item=>({property_path:item.path,value_kind:item.kind,value_text:item.text}));
 let writes=0,audits=0;
 const client={query:async(sql:string,params:unknown[]=[])=>{
  if(sql.includes("api_name='AceChatterCreateConversation'")&&sql.includes('SELECT id FROM md_flow_definitions'))
   return {rows:[{id:'flow-contact'}],rowCount:1};
  if(sql.includes('SELECT property_path,value_kind,value_text'))return {rows:stored,rowCount:stored.length};
  if(sql.startsWith('DELETE FROM md_flow_editor_values')){stored=[];writes++;return {rows:[],rowCount:1};}
  if(sql.includes('INSERT INTO md_flow_editor_values')){
   stored.push({property_path:String(params[2]),value_kind:String(params[3]),
    value_text:params[4]===null?null:String(params[4])});return {rows:[],rowCount:1};
  }
  if(sql.includes('INSERT INTO md_security_events'))audits++;
  return {rows:[],rowCount:1};
 }} as never;
 assert.equal(await reconcileAceChatterCreateConversationContactFields(client,'tenant-a'),true);
 const updated=decodeMetadataValues(stored).builder as {resources:Array<Record<string,unknown>>;elements:Array<{id:number;config:Record<string,unknown>}>};
 assert.ok(updated.resources.some(resource=>resource.name==='sourceObjectApi'&&resource.availableForInput===true));
 assert.ok(updated.resources.some(resource=>resource.name==='sourceRecordId'&&resource.availableForInput===true));
 const create=updated.elements.find(element=>element.id===4);
 const fieldValues=create?.config.fieldValues as Array<Record<string,unknown>>|undefined;
 assert.ok(fieldValues?.some(field=>field.field==='SourceObjectApi'&&field.value==='@sourceObjectApi'));
 assert.ok(fieldValues?.some(field=>field.field==='SourceRecordId'&&field.value==='@sourceRecordId'));
 assert.equal(await reconcileAceChatterCreateConversationContactFields(client,'tenant-a'),false);
 assert.equal(writes,1);assert.equal(audits,1);
});


for(const [logic,sortField,expectedSort] of [
 [undefined,'CreatedAt','ReceivedAt'],
 ['1 AND (2 OR 3)','CreatedAt','ReceivedAt'],
 [undefined,'SentAt','SentAt']
] as const){
test(`existing AceChatter inbox Flow repairs filters/sort (${logic??'implicit AND'}, ${sortField})`,async()=>{
 const original={
  apiName:'AceChatterLoadCommunications',elements:[
   {id:1,type:'Start',config:{}},
   {id:2,type:'Get Records',config:{object:'Communication',recordLimit:'200',
    outputVariable:'communications',conditions:[
     {field:'Channel',operator:'Equals',value:'WhatsApp'},
     {field:'Sender',operator:'Contains',value:'@searchTerm'},
     {field:'Recipient',operator:'Contains',value:'@searchTerm'}
    ],...(logic?{conditionLogic:logic}:{}),sortField,sortOrder:'Descending'}},
   {id:3,type:'End',config:{}}
  ],connectors:[
   {from:1,to:2,kind:'normal',label:'Next'},
   {from:2,to:3,kind:'normal',label:'Next'}
  ]
 };
 const encoded:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(original,'/builder',encoded);
 let stored=encoded.map(item=>({property_path:item.path,value_kind:item.kind,value_text:item.text}));
 let auditCount=0;
 const client={query:async(sql:string,params:unknown[]=[])=>{
  if(sql.includes('SELECT id FROM md_flow_definitions'))return {rows:[{id:'inbox-flow'}],rowCount:1};
  if(sql.includes('SELECT property_path,value_kind,value_text'))return {rows:stored,rowCount:stored.length};
  if(sql.startsWith('DELETE FROM md_flow_editor_values')){stored=[];return {rows:[],rowCount:1};}
  if(sql.includes('INSERT INTO md_flow_editor_values')){
   stored.push({property_path:String(params[2]),value_kind:String(params[3]),
    value_text:params[4]===null?null:String(params[4])});
  }
  if(sql.includes('INSERT INTO md_security_events'))auditCount++;
  return {rows:[],rowCount:1};
 }} as never;
 assert.equal(await reconcileAceChatterLoadCommunicationsFlow(client,'tenant-a'),true);
 const current=decodeMetadataValues(stored).builder as {
  elements:Array<{id:number;type:string;config:Record<string,unknown>}>;
 };
 assert.equal(current.elements.find(node=>node.id===2)?.config.conditionLogic,'1 AND (2 OR 3)');
 assert.equal(current.elements.find(node=>node.id===2)?.config.sortField,expectedSort);
 assert.equal(auditCount,1);
 assert.equal(await reconcileAceChatterLoadCommunicationsFlow(client,'tenant-a'),false,
  'the migration is idempotent');
});
}

test('reconcile legacy WhatsApp sender path on installed tenants without replacing recipient settings',async()=>{
 const graph={elements:[
  {id:1,type:'Start',config:{}},
  {id:4,type:'Get Records',config:{object:'ChatConversation',outputVariable:'conversation'}},
  {id:2,type:'HTTP Callout',config:{path:'v26.0/{!phoneNumberId}/messages',
   namedCredentialId:'existing-credential',method:'POST'}},
  {id:6,type:'Create Records',config:{object:'ChatMessage'}},
  {id:3,type:'End',config:{}}
 ],connectors:[
  {from:1,to:4,kind:'normal'},{from:4,to:2,kind:'normal'},
  {from:2,to:6,kind:'normal'},{from:6,to:3,kind:'normal'}
 ]};
 const encoded:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graph,'/builder',encoded);
 let stored=encoded.map(row=>({property_path:row.path,value_kind:row.kind,value_text:row.text}));
 const client={query:async(sql:string,params:unknown[]=[])=>{
  if(sql.includes('SELECT id FROM md_flow_definitions'))return {rows:[{id:'flow-id'}]};
  if(sql.includes('SELECT property_path,value_kind,value_text'))return {rows:stored};
  if(sql.startsWith('DELETE FROM md_flow_editor_values')){stored=[];return {rows:[]};}
  if(sql.includes('INSERT INTO md_flow_editor_values'))
   stored.push({property_path:String(params[2]),value_kind:String(params[3]),
    value_text:params[4]===null?null:String(params[4])});
  return {rows:[]};
 }} as never;
 assert.equal(await reconcileAceChatterCommunicationFlow(client,'tenant-a'),true);
 const revised=decodeMetadataValues(stored).builder as typeof graph;
 const callout=revised.elements.find(node=>node.id===2);
 assert.equal(callout?.config.path,'v26.0/{!phoneNumberId}/messages');
 assert.equal(callout?.config.namedCredentialId,'existing-credential');
 assert.equal((callout?.config.communicationLog as Record<string,unknown>)?.channel,'WhatsApp');
 assert.equal(await reconcileAceChatterCommunicationFlow(client,'tenant-a'),false);
});
