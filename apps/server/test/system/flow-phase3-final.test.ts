import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareFlowHttpRequest,mapFlowHttpResponse,parseFlowHttpMapping,publicHttpCredentialVariables,bindPublicHttpCredentialVariables} from
 '../../src/system-files/flow-http-mapping.js';
import {resolveFlowIntegrationCallout} from '../../src/system-files/flow-integration-connection.js';
import {evaluateFlowFormula,validateFlowFormula} from '../../src/system-files/flow-formula-runtime.js';
import type {SqlExecutor} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

test('No-code JSON request mapping resolves typed resources without arbitrary execution',()=>{
 const config={path:'v1/messages',queryParameters:'{"ref":"{!OrderId}","page":2}',
  body:'{"to":"{!Phone}","quantity":"{!Qty}","message":{"text":"Hello {!Name}"},"active":true}'};
 const actual=prepareFlowHttpRequest(config,{OrderId:'A&B',Phone:'+447000000001',
  Qty:3,Name:'Customer'});
 assert.equal(actual.path,'v1/messages?ref=A%26B&page=2');
 assert.deepEqual(JSON.parse(actual.body??''),{
  to:'+447000000001',quantity:3,message:{text:'Hello Customer'},active:true});
 assert.throws(()=>prepareFlowHttpRequest({...config,path:'https://evil.example/'},{}),/safe relative/);
 assert.throws(()=>prepareFlowHttpRequest({path:'v1',body:'{"token":"{!NotDeclared}"}'},{}),
  /Unknown HTTP Callout resource/);
 assert.throws(()=>parseFlowHttpMapping('{"__proto__":{"admin":true}}',{}),
  /Invalid HTTP mapping property/);
});

test('Structured query mappings reject object leakage and unsafe field names',()=>{
 assert.throws(()=>prepareFlowHttpRequest({path:'v1',queryParameters:'{"user":{"role":"admin"}}'},{}),
  /scalar/);
 assert.throws(()=>prepareFlowHttpRequest({path:'v1',queryParameters:'{"constructor":"x"}'},{}),
  /property name/);
});

test('HTTP response maps only declared output resources and bounds response values',()=>{
 const input='{"messageId":"response.id","statusCode":"response.code"}';
 const mapping=mapFlowHttpResponse(input,'{"response":{"id":"m1","code":201}}',
  ['messageId','statusCode']);
 assert.deepEqual({...mapping},{messageId:'m1',statusCode:201});
 assert.throws(()=>mapFlowHttpResponse('{"Other":"response.id"}','{"response":{"id":"m1"}}',
  ['messageId']),/output resource/);
 assert.throws(()=>mapFlowHttpResponse('{"messageId":"response"}',
  '{"response":{"secret":"not scalar"}}',['messageId']),/bounded scalar/);
 assert.throws(()=>mapFlowHttpResponse('{"statusCode":"response.id"}',
  '{"response":{"id":"not a number"}}',[{name:'statusCode',dataType:'Number'}]),
  /type mismatch/);
 assert.deepEqual({...mapFlowHttpResponse('{"statusCode":"response.code"}',
  '{"response":{"code":202}}',[{name:'statusCode',dataType:'Number'}])},
  {statusCode:202});
});

test('Integration provider resolves tenant credential, active operation and RBAC',async()=>{
 const calls:string[]=[];
 const rbac={require:async(_tenant:string,_user:string,name:string,action:string)=>{
  calls.push(name+':'+action);
 }} as unknown as RbacEngine;
 const db={query:async(sql:string,params:unknown[])=>{
  assert.equal(params[0],'tenant-1');
  if(sql.includes("kind='integration-connections'"))return {rows:[{properties:{
    connectorKey:'SmsProvider',status:'ACTIVE',configuration:{namedCredentialId:
     '00000000-0000-4000-8000-000000000001'}}}]};
  if(sql.includes("kind='connector-providers'"))return {rows:[{properties:{
    status:'ACTIVE',baseUrl:'https://api.example.com',
    operations:{SendSMS:{method:'POST',path:'v1/send'}}}}]};
  if(sql.includes('md_named_credentials'))
   return {rows:[{base_url:'https://api.example.com'}]};
  throw Error('Unexpected query');
 }} as unknown as SqlExecutor;
 const config={integrationConnectionId:'SmsConnection',operation:'SendSMS',
  method:'POST',path:'v1/send',body:'{"to":"{!Recipient}"}'};
 const result=await resolveFlowIntegrationCallout(db,rbac,'tenant-1','user-1',config);
 assert.equal(result.namedCredentialId,'00000000-0000-4000-8000-000000000001');
 assert.equal(result.method,'POST');
 assert.ok(calls.includes('SystemDefinition:connector-providers:read'));
 assert.ok(calls.includes('SystemDefinition:integration-connections:read'));
 await assert.rejects(()=>resolveFlowIntegrationCallout(db,rbac,'tenant-1','user-1',
  {...config,path:'v1/other'}),/modified outside provider metadata/);
});

test('Installed connector automatically assigns WhatsApp channel and message fields without Flow mapping',async()=>{
 const rbac={require:async()=>undefined} as unknown as RbacEngine;
 const credential='00000000-0000-4000-8000-000000000001';
 const db={query:async(sql:string)=>{
  if(sql.includes('FROM md_connector_app_credentials'))return {rows:[{properties:{
   channelId:'onesys_whatsapp',communicationChannel:'WhatsApp',
   defaultCommunicationFields:{recipient:'to',body:'text.body',responseId:'messages[0].id'}
  }}]};
  throw new Error('Unexpected query');
 }} as unknown as SqlExecutor;
 const resolved=await resolveFlowIntegrationCallout(db,rbac,'tenant-a','user-a',{
  namedCredentialId:credential,method:'POST',path:'v26.0/123/messages',
  body:'{"to":"447700900001","text":{"body":"Hello"}}'});
 const log=resolved.communicationLog as Record<string,unknown>;
 assert.equal(log.channel,'WhatsApp');
 assert.equal(log.provider,'onesys_whatsapp');
 assert.equal(log.requestRecipientPath,'to');
 assert.equal(log.requestBodyPath,'text.body');
 assert.equal(log.externalMessageIdResponsePath,'messages[0].id');
});

test('SMS Gate credential classifies outbound messages without any Flow logging metadata',async()=>{
 const rbac={require:async()=>undefined} as unknown as RbacEngine;
 const credential='00000000-0000-4000-8000-000000000001';
 const db={query:async(sql:string)=>{
  if(sql.includes('FROM md_connector_app_credentials'))return {rows:[{properties:{
   channelId:'onesys_sms_gate',communicationChannel:'SMS',
   defaultCommunicationFields:{recipient:'phoneNumbers[0]',
    body:'textMessage.text',responseId:'id'}
  }}]};
  throw new Error('Unexpected query');
 }} as unknown as SqlExecutor;
 const resolved=await resolveFlowIntegrationCallout(db,rbac,'tenant-a','user-a',{
  namedCredentialId:credential,method:'POST',path:'messages',
  body:'{"phoneNumbers":["447700900001"],"textMessage":{"text":"Hello"}}'});
 const metadata=resolved.communicationLog as Record<string,unknown>;
 assert.equal(metadata.channel,'SMS');
 assert.equal(metadata.provider,'onesys_sms_gate');
 assert.equal(metadata.requestRecipientPath,'phoneNumbers[0]');
 assert.equal(metadata.requestBodyPath,'textMessage.text');
 assert.equal(metadata.externalMessageIdResponsePath,'id');
});

test('VLOOKUP supports bounded typed read-only record collection values',()=>{
 const rows=[{SKU:'A',Price:3},{SKU:'B',Price:5}];
 const lookup='VLOOKUP("B", @Products, "SKU", "Price")';
 validateFlowFormula(lookup);
 assert.equal(evaluateFlowFormula(lookup,name=>name==='Products'?rows:null),5);
 assert.equal(evaluateFlowFormula('VLOOKUP("C", @Products, "SKU", "Price")',
  name=>name==='Products'?rows:null),null);
 assert.throws(()=>evaluateFlowFormula(lookup,()=>Array(201).fill({SKU:'B',Price:4})),
  /bounded record collection/);
});

test('Provider message Actions are exposed only through the browser metadata editor',async()=>{
 const {readFileSync}=await import('node:fs');
 const text=readFileSync(new URL('../../../web/src/core/builders/FlowBuilder/FlowBuilder.tsx',
  import.meta.url),'utf8');
 assert.match(text,/<option>Outbound Message<\/option>/);
 assert.match(text,/Outbound Message operation/);
});


test('public credential settings support reusable Flow URL mapping',()=>{
 const vars=publicHttpCredentialVariables({public_phoneNumberId:'1234567890123',username:'ignore'});
 assert.deepEqual({...vars},{public_phoneNumberId:'1234567890123'});
 assert.equal(prepareFlowHttpRequest({path:'v26.0/{!public_phoneNumberId}/messages'},vars).path,'v26.0/1234567890123/messages');
});

test('public credential settings cannot be spoofed by Flow callers or silently omitted',()=>{
 const caller={message:'Hello',public_phoneNumberId:'untrusted-id'};
 const saved={public_phoneNumberId:'trusted-meta-id'};
 const template=['v26.0/{!public_phoneNumberId}/messages'];
 const bound=bindPublicHttpCredentialVariables(caller,saved,template);
 assert.equal(bound.public_phoneNumberId,'trusted-meta-id');
 assert.equal(bound.message,'Hello');
 assert.equal(prepareFlowHttpRequest({path:template[0]},bound).path,
  'v26.0/trusted-meta-id/messages');
 assert.throws(()=>bindPublicHttpCredentialVariables(caller,null,template),
  /Required Named Credential public setting is unavailable/);
 assert.throws(()=>bindPublicHttpCredentialVariables(caller,{public_phoneNumberId:''},template),
  /Required Named Credential public setting is unavailable/);
 assert.equal(Object.hasOwn(bindPublicHttpCredentialVariables(caller,null,['v1/messages']),
  'public_phoneNumberId'),false);
});
