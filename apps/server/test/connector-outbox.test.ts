import assert from 'node:assert/strict';
import test from 'node:test';
import {IntegrationOutbox, type SqlClient} from '../src/connector-outbox.js';
const input={tenantId:'TENANT_A',credentialId:'CRED',operationKey:'payment-1',method:'POST',path:'/request',encryptedRequest:'enc:encrypted-payload'};
test('outbox creates typed SQL record, deduplicates operation and never overwrites original',async()=>{
  const calls:Array<{sql:string;params?:unknown[]}> = [];
  const db:SqlClient={ query:async(sql,params)=>{calls.push({sql,params});return {rows:sql.startsWith('INSERT')?[{id:'job-1'}]:[]};} };
  assert.equal(await new IntegrationOutbox(db).enqueue(input),'job-1');
  assert.match(calls[0].sql,/ON CONFLICT.*DO NOTHING/);
  assert.equal(calls[0].params?.[6],'enc:encrypted-payload');
});
test('worker claims tenant scope with skip locked; completion and failure require matching lease',async()=>{
  const calls:string[]=[];const db:SqlClient={query:async(sql)=>{calls.push(sql);return {rows:sql.includes('RETURNING o.*')?[{
    id:'job-1',tenant_id:'TENANT_A',credential_id:'CRED',operation_key:'payment-1',method:'POST',request_path:'/request',encrypted_request:'enc:data',attempts:1,max_attempts:3
  }]:[{id:'job-1'}]};}};
  const outbox=new IntegrationOutbox(db);
  const batch=await outbox.claim('TENANT_A','worker-1',10);
  assert.equal(batch[0].tenantId,'TENANT_A');assert.match(calls[0],/FOR UPDATE SKIP LOCKED/);
  await outbox.fail('TENANT_A','worker-1','job-1','HTTP_RATE_LIMIT',1500);
  await outbox.complete('TENANT_A','worker-1','job-1',200);
  assert.match(calls[1],/WHEN attempts>=max_attempts THEN 'dead'/);
  assert.match(calls[2],/encrypted_request=''/);
});
test('outbox rejects plaintext, unsafe path and cross-tenant missing lease',async()=>{
  const empty:SqlClient={query:async()=>({rows:[]})};const outbox=new IntegrationOutbox(empty);
  await assert.rejects(outbox.enqueue({...input,encryptedRequest:'plaintext'}),/INVALID_OUTBOX_INPUT/);
  await assert.rejects(outbox.enqueue({...input,path:'//external'}),/INVALID_OUTBOX_INPUT/);
  await assert.rejects(outbox.complete('OTHER','worker','job',200),/OUTBOX_LEASE_LOST/);
});
