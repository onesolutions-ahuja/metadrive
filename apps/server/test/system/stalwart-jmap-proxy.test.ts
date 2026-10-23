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
     'Content-Type':'application/json'},body:'{"methodCalls":[]}'
   });
   assert.equal(response.status,200);
   assert.equal(capturedUrl,'http://127.0.0.1:8080/jmap');
   assert.equal(capturedAuthorization,'Basic dXNlcjpwYXNz');
   assert.equal(capturedContentType,'application/json');
   assert.equal(capturedBody,'{"methodCalls":[]}');
  });
 }finally{globalThis.fetch=originalFetch;}
});
