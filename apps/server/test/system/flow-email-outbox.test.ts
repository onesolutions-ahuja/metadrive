import assert from 'node:assert/strict';
import test from 'node:test';
import type {PoolClient} from 'pg';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {NamedCredentialService} from '../../src/system-support/named-credential-service.js';

const tenant='00000000-0000-4000-8000-000000000001';
const user='00000000-0000-4000-8000-000000000002';
const flowId='00000000-0000-4000-8000-000000000003';
const runId='00000000-0000-4000-8000-000000000004';
const credential='00000000-0000-4000-8000-000000000005';
const jobId='00000000-0000-4000-8000-000000000006';

test('Flow Email persists encrypted outbox data and delivers only after transactional enqueue',async()=>{
 const priorKey=process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY;
 process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY=Buffer.alloc(32,9).toString('base64');
 const queueParams:unknown[][]=[],auditActions:string[]=[],sendArgs:unknown[][]=[];
 let persistedJob:Record<string,unknown>|undefined;
 const client={
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('FROM md_named_credentials'))return {rows:[{id:credential}]};
   if(sql.includes('INSERT INTO md_flow_email_jobs')){
    queueParams.push(params);return {rows:[{id:jobId}]};
   }
   if(sql.includes('INSERT INTO md_security_events'))
    auditActions.push(sql.includes("'flow.email.queued'")?'flow.email.queued':'flow.email.delivered');
   return {rows:[]};
  }
 } as unknown as PoolClient;
 const db={
  transaction:async<T>(run:(tx:PoolClient)=>Promise<T>)=>run(client),
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>;rowCount?:number}>=>{
   if(sql.includes('FROM md_flow_editor_values'))return {rows:[],rowCount:0};
   if(sql.includes('INSERT INTO md_security_events'))
    auditActions.push(sql.includes("'flow.email.queued'")?'flow.email.queued':'flow.email.delivered');
   return {rows:[],rowCount:sql.includes("UPDATE md_flow_email_jobs SET status='completed'")?1:0};
  }
 } as unknown as SqlPersistence;
 const permissionChecks:string[]=[];
 const rbac={require:async(_tenant:string,_user:string,resource:string,action:string)=>{
  permissionChecks.push(resource+':'+action);
 },allowed:async()=>true} as unknown as RbacEngine;
 const service=new NamedCredentialService(db,rbac);
 try{
  await service.enqueueFlowEmail(client,tenant,user,flowId,2,runId,4,7,credential,
   'sales@example.com',['buyer@example.com','owner@example.com'],'Order updated','Hello');
  assert.deepEqual(permissionChecks,['Email:send','NamedCredential:read']);
  assert(queueParams[0][8] instanceof Buffer);
  assert.equal((queueParams[0][8] as Buffer).includes(Buffer.from('buyer@example.com')),false);
  assert.equal(queueParams[0][9],'legacy');
  persistedJob={
   id:jobId,tenant_id:tenant,user_id:user,credential_id:credential,flow_id:flowId,
   flow_version:2,flow_api:'OrderFlow',payload_ciphertext:queueParams[0][8],
   encryption_key_id:'legacy'
  };
  db.transaction=async<T>(run:(tx:PoolClient)=>Promise<T>)=>run({
   query:async(sql:string)=>sql.includes('RETURNING j.id')
     ?{rows:[persistedJob!]}:{rows:[],rowCount:1}
  } as unknown as PoolClient);
  service.sendTenantEmail=async(...args:unknown[])=>{sendArgs.push(args);};
  assert.equal(await service.dispatchOneFlowEmail(),true);
  assert.deepEqual(sendArgs,[[tenant,credential,'sales@example.com',
   'buyer@example.com,owner@example.com','Order updated','Hello',user]]);
  assert(auditActions.includes('flow.email.queued'));
  assert(auditActions.includes('flow.email.delivered'));
 }finally{
  if(priorKey===undefined)delete process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY;
  else process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY=priorKey;
 }
});

test('Flow Email permission denial prevents creating the outbox row',async()=>{
 let inserted=false;
 const client={query:async(sql:string)=>{
  if(sql.includes('INSERT INTO md_flow_email_jobs'))inserted=true;
  return {rows:[{id:credential}]};
 }} as unknown as PoolClient;
 const rbac={require:async(_tenant:string,_user:string,resource:string)=>{
  if(resource==='Email')throw new Error('Permission denied');
 }} as unknown as RbacEngine;
 const service=new NamedCredentialService({} as SqlPersistence,rbac);
 await assert.rejects(service.enqueueFlowEmail(client,tenant,user,flowId,2,runId,4,7,
  credential,'sales@example.com',['buyer@example.com'],'Order updated','Hello'),/Permission denied/);
 assert.equal(inserted,false);
});
