import {withFlowCapabilities} from './flow-capability-test-helper.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import {NamedCredentialService} from '../../src/system-support/named-credential-service.js';

const tenantId='00000000-0000-4000-8000-000000000001';
const userId='00000000-0000-4000-8000-000000000002';
const runId='00000000-0000-4000-8000-000000000003';
const credentialId='00000000-0000-4000-8000-000000000004';
const jobId='00000000-0000-4000-8000-000000000005';
const rbac={require:async()=>{},allowed:async()=>true} as unknown as RbacEngine;

test('unwired Named Credential runtimes cannot send or queue external traffic',async()=>{
 const service=new NamedCredentialService({} as SqlPersistence,rbac);
 await assert.rejects(()=>service.callout(tenantId,userId,{
  namedCredentialId:credentialId,method:'POST',path:'v1/send'
 },{},'test-idempotency'),/Central Communication writer is unavailable/);
 await assert.rejects(()=>service.enqueueCallout({} as PoolClient,tenantId,userId,
  runId,1,{namedCredentialId:credentialId,method:'POST',path:'v1/send'},{}),
  /Central Communication writer is unavailable/);
});

test('durable HTTP Callout validation rejects synchronous outputs',async()=>{
 const runtime=new FlowRuntime(withFlowCapabilities({} as SqlPersistence),rbac);
 const draft={apiName:'AsyncFlow',flowType:'Autolaunched Flow',
  elements:[
   {id:1,type:'Start',config:{}},
   {id:2,type:'HTTP Callout',config:{
    namedCredentialId:credentialId,method:'POST',path:'v1/events',
    deliveryMode:'DURABLE_ASYNC'
   }},
   {id:3,type:'End',config:{}}
  ],
  connectors:[{from:1,to:2},{from:2,to:3}]};
 assert.equal((await runtime.validateDraft(tenantId,userId,'AsyncFlow',draft)).valid,true);
 const invalid={...draft,elements:draft.elements.map(element=>element.id===2
  ?{...element,config:{...element.config,responseVariable:'Response'}}:element)};
 const result=await runtime.validateDraft(tenantId,userId,'AsyncFlow',invalid);
 assert.equal(result.valid,false);
 assert.ok(result.errors.includes('Durable async HTTP Callout cannot return response variables'));
});

test('durable HTTP Callout encrypts payload and never blindly retries uncertain provider outcome',async()=>{
 const previousKey=process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY;
 process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
 const values:Array<unknown[]>=[];
 const jobParameters:unknown[][]=[];
 let updateSql='';
 let updateParameters:unknown[]=[];
 let claims=0;
 const idempotencyKeys:string[]=[];
 const client={
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<{id:string}>}>=>{
   if(sql.includes('FROM md_named_credentials'))return {rows:[{id:credentialId}]};
   if(sql.includes('INSERT INTO md_http_callout_jobs')){
    jobParameters.push(params);return {rows:[{id:jobId}]};
   }
   if(sql.includes('INSERT INTO md_http_callout_job_values'))values.push(params);
   return {rows:[]};
  }
 } as unknown as PoolClient;
 const db={
  transaction:async<T>(run:(client:PoolClient)=>Promise<T>)=>run(client),
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('FROM md_flow_runs r'))return {rows:[{api_name:'AsyncFlow'}]};
   if(sql.includes('SELECT api_name,value_ciphertext'))return {rows:values.map(value=>({
    api_name:value[2],value_ciphertext:value[3],data_type:value[4]
   }))};
   if(sql.includes('UPDATE md_http_callout_jobs')){
    updateSql=sql;updateParameters=params;
   }
   return {rows:[]};
  }
 } as unknown as SqlPersistence;
 const service=new NamedCredentialService(db,rbac);
 service.setIntegrationActivityWriter(async()=>undefined);
 let sent:Record<string,unknown>|undefined;
 service.callout=async(_tenant,_user,config,variables,key)=>{
  idempotencyKeys.push(key);
  if(idempotencyKeys.length===1)throw new Error('temporary outage');
  sent={config,variables,key};return {status:204,body:''};
 };
 try{
  await service.enqueueCallout(client,tenantId,userId,runId,9,{
   namedCredentialId:credentialId,method:'POST',path:'v1/{!RecordId}',
   headers:'X-Request: {!RequestId}',body:'{"secret":"{!Payload}"}',
   idempotencyKey:'order-{!RequestId}',maxAttempts:3
  },{RecordId:'42',RequestId:'request-1',Payload:'private-data'});
  assert.equal(jobParameters[0][6] instanceof Buffer,true);
  assert.equal(jobParameters[0][8] instanceof Buffer,true);
  assert.equal(values[0][3] instanceof Buffer,true);
  db.transaction=async<T>(run:(client:PoolClient)=>Promise<T>)=>run({
   query:async()=>({rows:[{
    id:jobId,tenant_id:tenantId,run_id:runId,user_id:userId,credential_id:credentialId,method:'POST',
    path_ciphertext:jobParameters[0][6],headers_ciphertext:jobParameters[0][7],
    body_ciphertext:jobParameters[0][8],idempotency_key_ciphertext:jobParameters[0][9],
    max_attempts:3,timeout_ms:15000,attempt_count:++claims
   }]})
  } as unknown as PoolClient);
  assert.equal(await service.dispatchOne(),true);
  assert.match(updateSql,/status='failed'/);
  assert.match(updateSql,/status='failed'/);
  assert.deepEqual(updateParameters,[tenantId,jobId]);
  assert.equal(sent,undefined);
  assert.deepEqual(idempotencyKeys,['order-request-1']);
 }finally{
  if(previousKey===undefined)delete process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY;
  else process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY=previousKey;
 }
});

test('durable external message metadata uses valid SQL key and type',async()=>{
 const previousKey=process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY;
 process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY=Buffer.alloc(32,9).toString('base64');
 const writes:Array<{sql:string;params:unknown[]}>=[],id=credentialId;
 const client={query:async(sql:string,params:unknown[]=[])=>{
  writes.push({sql,params});
  if(sql.includes('FROM md_connector_app_credentials'))return {rows:[]};
  if(sql.includes('FROM md_named_credentials'))return {rows:[{id}]};
  if(sql.includes('INSERT INTO md_http_callout_jobs'))return {rows:[{id:jobId}]};
  return {rows:[]};
 }} as unknown as PoolClient;
 const service=new NamedCredentialService({} as SqlPersistence,rbac);
 service.setIntegrationActivityWriter(async()=>undefined);
 try{
  await service.enqueueCallout(client,tenantId,userId,runId,9,{
   namedCredentialId:credentialId,method:'POST',path:'v1/message',
   communicationLog:{provider:'onesys_whatsapp',channel:'WhatsApp'}
  },{});
  const metadata=writes.find(row=>row.sql.includes("'OneSysCommunicationLog'"));
  assert.ok(metadata);
  assert.match(metadata.sql,/\'string\'/);
  assert.equal(metadata.params[2] instanceof Buffer,true);
  assert.ok(!writes.some(row=>row.sql.includes("'__communication_log'")));
 }finally{
  if(previousKey===undefined)delete process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY;
  else process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY=previousKey;
 }
});

test('abandoned HTTP callout leases are quarantined and cannot be selected again',async()=>{
 const statements:string[]=[];
 const db={
  transaction:async<T>(run:(client:PoolClient)=>Promise<T>)=>run({
   query:async(sql:string)=>{statements.push(sql);return {rows:[]};}
  } as unknown as PoolClient)
 } as unknown as SqlPersistence;
 const service=new NamedCredentialService(db,rbac);
 assert.equal(await service.dispatchOne(),false);
 assert.match(statements[0],/status='failed'/);
 assert.match(statements[0],/RECONCILIATION_REQUIRED/);
 assert.match(statements[0],/status='processing' AND claimed_at</);
 assert.match(statements[1],/WHERE status='queued' AND next_attempt_at<=now\(\)/);
 assert.doesNotMatch(statements[1],/OR \(status='processing'/);
});

test('revoked Flow eligibility prevents queued HTTP provider delivery',async()=>{
 let delivered=false,failed=false;
 const db={
  transaction:async<T>(run:(client:PoolClient)=>Promise<T>)=>run({
   query:async(sql:string)=>{
    if(sql.includes('WITH candidate'))return {rows:[{
     id:jobId,tenant_id:tenantId,run_id:runId,user_id:userId,credential_id:credentialId,
     method:'POST',attempt_count:1
    }]};
    return {rows:[]};
   }
  } as unknown as PoolClient),
  query:async(sql:string)=>{
   if(sql.includes('FROM md_flow_runs r'))return {rows:[]};
   if(sql.includes("SET status='failed'"))failed=true;
   return {rows:[],rowCount:1};
  }
 } as unknown as SqlPersistence;
 const svc=new NamedCredentialService(db,rbac);
 svc.callout=async()=>{delivered=true;return {status:200,body:''};};
 assert.equal(await svc.dispatchOne(),true);
 assert.equal(delivered,false);
 assert.equal(failed,true);
});

test('successful durable callout persists provider acknowledgement in same SQL transaction',async()=>{
 const written:Array<{sql:string;params:unknown[]}>=[];

 const client={query:async(sql:string,params:unknown[]=[])=>{
  written.push({sql,params});
  if(sql.includes('WITH candidate'))return {rows:[{
   id:jobId,tenant_id:tenantId,run_id:runId,user_id:userId,credential_id:credentialId,
   method:'POST',path_ciphertext:Buffer.alloc(1),headers_ciphertext:Buffer.alloc(1),
   body_ciphertext:null,idempotency_key_ciphertext:null,attempt_count:1,timeout_ms:15000
  }]};
  return {rows:[],rowCount:1};
 }} as unknown as PoolClient;
 const db={
  transaction:async<T>(fn:(client:PoolClient)=>Promise<T>)=>fn(client),
  query:async(sql:string)=>{
   if(sql.includes('FROM md_flow_runs r'))return {rows:[{api_name:'AsyncFlow'}]};
   return {rows:[],rowCount:1};
  }
 } as unknown as SqlPersistence;
 const svc=new NamedCredentialService(db,rbac);
 (svc as unknown as {decryptValue:(encrypted:Buffer)=>string}).decryptValue=()=> 'safe-path';
 svc.callout=async()=>({status:202,body:''});
 assert.equal(await svc.dispatchOne(),true);
 const receipt=written.find(x=>x.sql.includes('INSERT INTO md_http_callout_receipts'));
 assert.ok(receipt);
 assert.deepEqual(receipt.params,[tenantId,jobId,1,202]);
 assert.ok(written.some(x=>x.sql.includes("SET status='completed'")));
});

test('deactivated integration connection blocks a previously enqueued provider message',async()=>{
 let delivered=false,failed=false;
 const client={query:async(sql:string)=>{
  if(sql.includes('WITH candidate'))return {rows:[{
   id:jobId,tenant_id:tenantId,run_id:runId,user_id:userId,credential_id:credentialId,
   connection_api:'SmsConnection',operation_api:'SendSMS',
   operation_path_ciphertext:Buffer.alloc(33),
   method:'POST',attempt_count:1,max_attempts:1
  }]};
  return {rows:[],rowCount:1};
 }} as unknown as PoolClient;
 const db={transaction:async<T>(fn:(client:PoolClient)=>Promise<T>)=>fn(client),
  query:async(sql:string)=>{
   if(sql.includes('FROM md_flow_runs r'))return {rows:[{api_name:'AsyncFlow'}]};
   if(sql.includes('kind=\'integration-connections\''))return {rows:[]};
   if(sql.includes("SET status='failed'"))failed=true;
   return {rows:[],rowCount:1};
  }
 } as unknown as SqlPersistence;
 const service=new NamedCredentialService(db,rbac);
 service.callout=async()=>{delivered=true;return {status:200,body:''};};
 assert.equal(await service.dispatchOne(),true);
 assert.equal(delivered,false);
 assert.equal(failed,true);
});
