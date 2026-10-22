import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reconcileAceChatterCredentialFlow,seedAceChatterFlowsForTenant} from '../../src/app-seeders/acechatter-flow.js';
import {decodeMetadataValues,encodeMetadataValue} from '../../src/system-files/component-runtime.js';

test('AceChatter app seeding is tenant-scoped, idempotent and preserves business data',async()=>{
 const seen:Array<{sql:string;params:unknown[]}>=[],flows=new Set<string>();
 let graphRows=0;
 const client={query:async(sql:string,params:unknown[]=[])=>{
  seen.push({sql,params});
  if(sql.includes('SELECT 1 FROM md_flow_definitions')){
    const name=String(params[1]);return {rows:flows.has(name)?[{exists:true}]:[],rowCount:flows.has(name)?1:0};
  }
  if(sql.includes('INSERT INTO md_flow_definitions')){
    const name=String(params[1]);flows.add(name);
    return {rows:[{id:'flow-'+name}],rowCount:1};
  }
  if(sql.includes('INSERT INTO md_flow_editor_values'))graphRows++;
  return {rows:[],rowCount:1};
 }} as never;
 const first=await seedAceChatterFlowsForTenant(client,'tenant-a');
 assert.equal(first,5);
 assert.equal(graphRows>0,true);
 assert.equal(flows.has('AceChatterLoadConversations'),true);
 assert.equal(flows.has('AceChatterLoadMessages'),true);
 assert.equal(flows.has('AceChatterSendMessage'),true);
 assert.equal(flows.has('AceChatterReceiveWebhook'),true);
 assert.equal(flows.has('AceChatterCreateConversation'),true);
 const before=graphRows;
 const second=await seedAceChatterFlowsForTenant(client,'tenant-a');
 assert.equal(second,0);
 assert.equal(graphRows,before);
 assert.equal(seen.every(call=>!call.sql.includes('INSERT INTO md_records') &&
   !call.sql.includes('INSERT INTO md_permission_assignments')),true);
 const created=seen.filter(call=>call.sql.includes('INSERT INTO md_flow_definitions'));
 assert.equal(created.find(call=>call.params[1]==='AceChatterSendMessage')?.params[3],false,
  'WhatsApp delivery must remain disabled until provider credentials are configured');
 assert.equal(created.filter(call=>call.params[3]===true).length,4);
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
 assert.equal(current.elements.find(element=>element.id===2)?.config.namedCredentialId,credential);
 assert.equal(current.elements.find(element=>element.id===2)?.config.path,
  'v26.0/{!public_phoneNumberId}/messages');
 assert.equal(await reconcileAceChatterCredentialFlow(client,'tenant-a'),false);
 assert.equal(deletions,1);
 assert.equal(audits,1);
});
