import assert from 'node:assert/strict';
import {test} from 'node:test';
import {writeIntegrationApiLog} from '../../src/system-support/integration-api-log.js';

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
