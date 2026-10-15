import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const pkg=JSON.parse(readFileSync(new URL('../apps/server/data/installable-app-packages.json',import.meta.url),'utf8')).packages.find(p=>p.appKey==='whatsapp');
const server=readFileSync(new URL('../apps/server/src/index.ts',import.meta.url),'utf8');
test('Chatter validates public inputs before trusted authorization enriches resource values',()=>{
 const pos=server.indexOf("app.post('/api/flows/:apiName/execute'");
 assert.ok(pos>0);
 const route=server.slice(pos,pos+2600);
 const inputCheck=route.indexOf('validateFlowInputValues(flow, sanitizeChatterCallerInput(apiName, input.data))');
 const authorize=route.indexOf('authoriseChatterFlow(apiName');
 assert.ok(inputCheck>0 && authorize>inputCheck,'validate raw input before server-derived Flow resources');
 assert.ok(!route.includes('validateFlowInputValues(flow, authorisedInput)'), 'server-derived values must not be rejected as external input');
});
test('packaged Send and Assign Flows declare all server-injected resource names',()=>{
 const expected={
  CHATTER_SEND_MESSAGE:['ConversationId','ChannelAccountId','RecipientPhone','Body','SenderPhone','AssignedUserId','AuthorisedCredentialId','AuthorisedMessagePath'],
  CHATTER_ASSIGN_CONVERSATION:['ConversationId','ChannelAccountId','TargetRecordId','AssigneeId']
 };
 for(const [apiName,names] of Object.entries(expected)){
  const flow=pkg.flows.find(f=>f.apiName===apiName);
  assert.ok(flow,apiName+' installed');
  for(const name of names){
   const resource=flow.resources.find(r=>r.name===name);
   assert.ok(resource,apiName+' resource '+name+' missing');
   assert.equal(resource.availableForInput,true,apiName+' runtime must receive trusted '+name);
  }
  const references=JSON.stringify(flow.elements).matchAll(/\{!([A-Za-z][A-Za-z0-9_]*)\}/g);
  const keys=new Set(flow.resources.map(r=>r.name));
  for(const match of references)assert.ok(keys.has(match[1]),apiName+' undeclared resource '+match[1]);
 }
});

test('Chatter inbox refreshes RBAC-bound records and maintains independent scroll areas',()=>{
 const runtime=readFileSync(new URL('../apps/web/src/pageRuntimeViews.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../apps/web/src/custom-components/ChatterInbox/ChatterInbox.css',import.meta.url),'utf8');
 const view=readFileSync(new URL('../apps/web/src/custom-components/ChatterInbox/ChatterInbox.jsx',import.meta.url),'utf8');
 assert.match(runtime,/const interval = chatter \? window\.setInterval\(onVisible, 5000\)/);
 assert.match(runtime,/loadFlowScreenRecords\(objectApiName\)/);
 assert.match(css,/\.md-chatter-scroll\{[^}]*min-height:0;[^}]*flex:1 1 0/);
 assert.match(css,/\.md-chatter-list\{[^}]*min-height:0/);
 assert.match(view,/const canSendSelected = newChat \?/);
 assert.match(view,/event: 'send'/);
});
