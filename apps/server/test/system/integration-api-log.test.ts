import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import {registerIntegrationApiLogRoutes,writeIntegrationApiLog} from '../../src/system-support/integration-api-log.js';

test('integration API audit stores tenant-scoped request metadata without payloads or query strings',async()=>{
 let captured:{sql:string;params:unknown[]}|undefined;
 const db={query:async(sql:string,params:unknown[]=[])=>{
  captured={sql,params};return {rows:[],rowCount:1};
 }} as never;
 await writeIntegrationApiLog(db,{
  tenantId:'tenant-a',direction:'Outbound',provider:'WhatsApp Credential',
  credentialId:'credential-a',actorUserId:'user-a',
  endpoint:'https://provider.example/messages?access_token=secret',
  method:'POST',statusCode:200,outcome:'success',durationMs:15,
  requestBytes:48,responseBytes:25
 });
 assert.ok(captured);
 assert.match(captured.sql,/INSERT INTO md_integration_api_logs/);
 assert.equal(captured.params[0],'tenant-a');
 assert.equal(captured.params[1],'Outbound');
 assert.equal(captured.params[6],'https://provider.example/messages');
 assert.equal(captured.params[7],'POST');
 assert.equal(captured.params[8],200);
 assert.equal(captured.params[9],'success');
 assert.equal(captured.params[10],15);
 assert.equal(captured.params[11],48);
 assert.equal(captured.params[12],25);
 assert.doesNotMatch(captured.params.join(' '),/access_token|secret/);
});

test('integration API audit failures do not replace the provider operation result',async()=>{
 const original=console.error;
 let logged=false;
 console.error=(...args:unknown[])=>{logged=true;assert.doesNotMatch(args.map(String).join(' '),/secret|token|body/i);};
 try{
  await writeIntegrationApiLog({query:async()=>{throw new Error('database failed with secret token');}} as never,{
   tenantId:'tenant-a',direction:'Inbound',transport:'Webhook',
   endpoint:'/api/inbound-webhooks/example',method:'POST',statusCode:503,
   outcome:'http_error',errorCode:'FLOW_UNAVAILABLE'
  });
  assert.equal(logged,true);
 }finally{console.error=original;}
});

test('integration API log endpoint is tenant-scoped and requires Named Credential read access',async()=>{
 let queryParams:unknown[]=[];
 let required:string[]=[];
 const db={query:async(sql:string,params:unknown[]=[])=>{
  queryParams=params;
  assert.match(sql,/WHERE tenant_id=\$1/);
  return {rows:[{id:'log-1',direction:'Outbound',transport:'HTTP',provider:'Provider',
   credential_id:'credential-1',endpoint:'https://provider.example/messages',method:'POST',
   status_code:200,outcome:'success',duration_ms:20,request_bytes:12,response_bytes:30,
   error_code:null,created_at:new Date('2026-10-22T10:00:00.000Z')}]};
 }} as never;
 const rbac={require:async(_tenant:string,_user:string,resource:string)=>{
  required.push(resource);
 }} as never;
 const app=express();
 app.use((req,_res,next)=>{
  (req as typeof req&{actor:{tenant_id:string;user_id:string}}).actor={tenant_id:'tenant-a',user_id:'user-a'};
  next();
 });
 registerIntegrationApiLogRoutes(app,db,rbac);
 const server=app.listen(0);
 try{
  const address=server.address();
  if(!address||typeof address==='string')throw Error('No server port');
  const response=await fetch('http://127.0.0.1:'+address.port+'/api/metadata/integration-api-logs?direction=Outbound&limit=20');
  assert.equal(response.status,200);
  const payload=await response.json() as {logs:Array<Record<string,unknown>>};
  assert.equal(payload.logs.length,1);
  assert.equal(payload.logs[0].id,'log-1');
  assert.equal('body' in payload.logs[0],false);
  assert.deepEqual(required,['NamedCredential']);
  assert.deepEqual(queryParams,['tenant-a','Outbound',20]);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
