import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareFlowHttpRequest,mapFlowHttpResponse,parseFlowHttpMapping} from
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
