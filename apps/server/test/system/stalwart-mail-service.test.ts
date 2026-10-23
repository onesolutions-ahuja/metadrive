import test from 'node:test';
import assert from 'node:assert/strict';
import {StalwartMailService} from '../../src/system-support/stalwart-mail-service.js';

test('Stalwart v0.16 Account/set created object IDs and credential maps work end to end',async()=>{
 const previous=globalThis.fetch;
 const calls:Array<[string,Record<string,unknown>]>=[];
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url.endsWith('/.well-known/jmap'))
   return new Response(JSON.stringify({apiUrl:'https://mail.example.test/jmap/'}),{status:200});
  assert.equal(url,'http://127.0.0.1:8080/jmap');
  assert.equal((init?.headers as Record<string,string>).authorization,'Bearer test-key');
  const body=JSON.parse(String(init?.body)) as {
   methodCalls:Array<[string,Record<string,unknown>,string]>
  };
  const [method,args,callId]=body.methodCalls[0];
  calls.push([method,args]);
  let result:Record<string,unknown>;
  if(method==='x:Domain/query')result={ids:['domain-1']};
  else if(method==='x:Domain/get')result={list:[{id:'domain-1',name:'unesolutions.co.uk',isEnabled:true}]};
  else if(method==='x:Account/query')result={ids:[]};
  else if(method==='x:Account/set'&&'tenantGroup' in (args.create as Record<string,unknown>)){
   const create=(args.create as Record<string,Record<string,unknown>>).tenantGroup;
   assert.deepEqual(create.roles,{'@type':'Custom',roleIds:{}});
   assert.deepEqual(create.permissions,{'@type':'Inherit'});
   result={created:{tenantGroup:{id:'group-1'}}};
  }
  else if(method==='x:Account/set'&&'newMailbox' in (args.create as Record<string,unknown>)){
   const create=(args.create as Record<string,Record<string,unknown>>).newMailbox;
   assert.deepEqual(create.memberGroupIds,{'group-1':true});
   assert.equal(Object.hasOwn(create,'description'),false);
   assert.deepEqual(create.credentials,{'0':{'@type':'Password',secret:'strong-test-password'}});
   assert.deepEqual(create.permissions,{'@type':'Replace',enabledPermissions:{
    authenticate:true,jmapEmailGet:true,jmapEmailQuery:true,jmapMailboxGet:true,
    jmapIdentityGet:true,jmapEmailUpdate:true,jmapEmailImport:true,
    jmapEmailSubmissionCreate:true,jmapBlobUpload:true,jmapBlobGet:true
   },disabledPermissions:{}});
   result={created:{newMailbox:{id:'account-1'}}};
  }else throw Error('Unexpected JMAP call: '+method);
  return new Response(JSON.stringify({methodResponses:[[method,result,callId]]}),{status:200});
 }) as typeof fetch;
 try{
  const service=new StalwartMailService('http://127.0.0.1:8080','test-key',['unesolutions.co.uk']);
  const created=await service.createMailbox('12345678-1234-4234-8234-123456789abc',
   {name:'accounts',domainId:'domain-1',password:'strong-test-password'});
  assert.deepEqual(created,{id:'account-1',emailAddress:'accounts@unesolutions.co.uk'});
  assert.equal(calls.filter(([name])=>name==='x:Account/set').length,2);
 }finally{globalThis.fetch=previous;}
});

test('Stalwart mailbox listing returns no records when tenant group is absent',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(String(input).endsWith('/.well-known/jmap'))
   return new Response(JSON.stringify({apiUrl:'https://mail.example.test/jmap/'}),{status:200});
  const body=JSON.parse(String(init?.body)) as {methodCalls:Array<[string,unknown,string]>};
  const [method,,callId]=body.methodCalls[0];
  const result=method==='x:Domain/query'?{ids:['domain-1']}:
   method==='x:Domain/get'?{list:[{id:'domain-1',name:'unesolutions.co.uk',isEnabled:true}]}:
   method==='x:Account/query'?{ids:[]}:(()=>{throw Error('Unexpected method')})();
  return new Response(JSON.stringify({methodResponses:[[method,result,callId]]}),{status:200});
 }) as typeof fetch;
 try{
  const service=new StalwartMailService('http://127.0.0.1:8080','test-key',['unesolutions.co.uk']);
  assert.deepEqual(await service.listMailboxes('12345678-1234-4234-8234-123456789abc'),[]);
 }finally{globalThis.fetch=previous;}
});
