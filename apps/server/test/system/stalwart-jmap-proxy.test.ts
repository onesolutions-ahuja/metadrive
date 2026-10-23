import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registerStalwartJmapProxyRoutes} from '../../src/system-support/stalwart-jmap-proxy.js';

async function withServer(run:(origin:string)=>Promise<void>){
 const app=express();
 registerStalwartJmapProxyRoutes(app);
 const server=app.listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address();
 if(!address||typeof address==='string')throw new Error('Test server did not bind to a TCP port');
 try{await run('http://127.0.0.1:'+address.port);}
 finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}

test('JMAP proxy answers allowlisted browser preflight without requiring mailbox credentials',async()=>{
 await withServer(async origin=>{
  const response=await fetch(origin+'/api/mail-jmap/jmap',{
   method:'OPTIONS',headers:{Origin:'https://unesolutions.co.uk','Access-Control-Request-Method':'POST',
    'Access-Control-Request-Headers':'authorization,content-type'}
  });
  assert.equal(response.status,204);
  assert.equal(response.headers.get('access-control-allow-origin'),'https://unesolutions.co.uk');
  assert.match(response.headers.get('access-control-allow-headers')??'',/Authorization/i);
 });
});

test('JMAP proxy rejects browser origins outside the explicit allowlist',async()=>{
 await withServer(async origin=>{
  const response=await fetch(origin+'/api/mail-jmap/jmap',{
   method:'POST',headers:{Origin:'https://attacker.example',Authorization:'Basic dXNlcjpwYXNz',
    'Content-Type':'application/json'},body:'{}'
  });
  assert.equal(response.status,403);
 });
});

test('JMAP proxy requires mailbox Basic auth and does not proxy unknown paths',async()=>{
 await withServer(async origin=>{
  const noAuth=await fetch(origin+'/api/mail-jmap/jmap',{
   method:'POST',headers:{Origin:'https://unesolutions.co.uk','Content-Type':'application/json'},body:'{}'
  });
  assert.equal(noAuth.status,401);
  const unknown=await fetch(origin+'/api/mail-jmap/admin/config',{
   method:'GET',headers:{Origin:'https://unesolutions.co.uk',Authorization:'Basic dXNlcjpwYXNz'}
  });
  assert.equal(unknown.status,404);
 });
});

test('JMAP proxy forwards mailbox Basic auth to the private JMAP endpoint without adding a management key',async()=>{
 const originalFetch=globalThis.fetch;
 const originalBase=process.env.STALWART_BASE_URL;
 process.env.STALWART_BASE_URL='http://127.0.0.1:8080';
 let capturedUrl='';let capturedAuthorization='';let capturedContentType='';let capturedBody='';
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  capturedUrl=String(input);
  const headers=new Headers(init?.headers);
  capturedAuthorization=headers.get('authorization')??'';
  capturedContentType=headers.get('content-type')??'';
  if(init?.body)capturedBody=await new Response(init.body as BodyInit).text();
  return new Response(JSON.stringify({methodResponses:[['Mailbox/get',{list:[]},'mb']]}),{
   status:200,headers:{'content-type':'application/json'}
  });
 }) as typeof fetch;
 try{
  await withServer(async origin=>{
   const response=await originalFetch(origin+'/api/mail-jmap/jmap',{
    method:'POST',headers:{Origin:'https://unesolutions.co.uk',Authorization:'Basic dXNlcjpwYXNz',
     'Content-Type':'application/json'},body:JSON.stringify({
     using:['urn:ietf:params:jmap:core','urn:ietf:params:jmap:mail','urn:ietf:params:jmap:submission'],
     methodCalls:[['Email/query',{accountId:'acct',filter:{}},'q']]
    })
   });
   assert.equal(response.status,200);
   assert.equal(capturedUrl,'http://127.0.0.1:8080/jmap');
   assert.equal(capturedAuthorization,'Basic dXNlcjpwYXNz');
   assert.equal(capturedContentType,'application/json');
   assert.equal(capturedBody,JSON.stringify({using:['urn:ietf:params:jmap:core','urn:ietf:params:jmap:mail','urn:ietf:params:jmap:submission'],methodCalls:[['Email/query',{accountId:'acct',filter:{}},'q']]}));
  });
 }finally{
  globalThis.fetch=originalFetch;
  if(originalBase===undefined)delete process.env.STALWART_BASE_URL;else process.env.STALWART_BASE_URL=originalBase;
 }
});

test('JMAP proxy follows only Stalwart same-origin discovery redirects to the session endpoint',async()=>{
 const originalFetch=globalThis.fetch;
 const originalBase=process.env.STALWART_BASE_URL;
 process.env.STALWART_BASE_URL='http://127.0.0.1:8080';
 const calls:Array<{url:string;authorization:string;redirect:RequestRedirect|undefined}>=[];
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  const headers=new Headers(init?.headers);
  calls.push({url,authorization:headers.get('authorization')??'',redirect:init?.redirect});
  return calls.length===1
   ?new Response(null,{status:307,headers:{location:'/jmap/session'}})
   :new Response(JSON.stringify({apiUrl:'http://127.0.0.1:8080/jmap'}),{
    status:200,headers:{'content-type':'application/json'}
   });
 }) as typeof fetch;
 try{
  await withServer(async origin=>{
   const response=await originalFetch(origin+'/api/mail-jmap/.well-known/jmap',{
    headers:{Origin:'https://unesolutions.co.uk',Authorization:'Basic dXNlcjpwYXNz'}
   });
   assert.equal(response.status,200);
   assert.deepEqual(calls.map(call=>call.url),[
    'http://127.0.0.1:8080/.well-known/jmap','http://127.0.0.1:8080/jmap/session'
   ]);
   assert.deepEqual(calls.map(call=>call.authorization),['Basic dXNlcjpwYXNz','Basic dXNlcjpwYXNz']);
   assert.equal(calls[0].redirect,'manual');
   assert.equal(calls[1].redirect,'error');
  });
 }finally{
  globalThis.fetch=originalFetch;
  if(originalBase===undefined)delete process.env.STALWART_BASE_URL;else process.env.STALWART_BASE_URL=originalBase;
 }
});

test('JMAP proxy refuses cross-origin discovery redirects',async()=>{
 const originalFetch=globalThis.fetch;
 const originalBase=process.env.STALWART_BASE_URL;
 process.env.STALWART_BASE_URL='http://127.0.0.1:8080';
 let calls=0;
 globalThis.fetch=(async()=>{
  calls++;
  return new Response(null,{status:307,headers:{location:'https://attacker.example/jmap/session'}});
 }) as typeof fetch;
 try{
  await withServer(async origin=>{
   const response=await originalFetch(origin+'/api/mail-jmap/.well-known/jmap',{
    headers:{Origin:'https://unesolutions.co.uk',Authorization:'Basic dXNlcjpwYXNz'}
   });
   assert.equal(response.status,502);
   assert.equal(calls,1);
  });
 }finally{
  globalThis.fetch=originalFetch;
  if(originalBase===undefined)delete process.env.STALWART_BASE_URL;else process.env.STALWART_BASE_URL=originalBase;
 }
});

test('JMAP proxy blocks Stalwart management methods even when mailbox auth is supplied',async()=>{
 const originalFetch=globalThis.fetch;
 let upstreamCalled=false;
 globalThis.fetch=(async()=>{upstreamCalled=true;return new Response('{}',{status:200});}) as typeof fetch;
 try{
  await withServer(async origin=>{
   const response=await originalFetch(origin+'/api/mail-jmap/jmap',{
    method:'POST',headers:{Origin:'https://unesolutions.co.uk',Authorization:'Basic dXNlcjpwYXNz',
     'Content-Type':'application/json'},
    body:JSON.stringify({using:['urn:ietf:params:jmap:core','urn:ietf:params:jmap:mail','urn:ietf:params:jmap:submission'],
     methodCalls:[['x:Account/set',{create:{}},'admin']]})
   });
   assert.equal(response.status,403);
   assert.equal(upstreamCalled,false);
  });
 }finally{globalThis.fetch=originalFetch;}
});
