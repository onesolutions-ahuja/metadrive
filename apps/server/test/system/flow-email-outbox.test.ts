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

test('Legacy Flow Email fails closed before queuing SMTP delivery',async()=>{
 let inserted=false;
 const client={
  query:async(sql:string):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('INSERT INTO md_flow_email_jobs'))inserted=true;
   return {rows:[]};
  }
 } as unknown as PoolClient;
 const db={transaction:async<T>(run:(tx:PoolClient)=>Promise<T>)=>run(client)} as unknown as SqlPersistence;
 const permissionChecks:string[]=[];
 const rbac={require:async(_tenant:string,_user:string,resource:string,action:string)=>{
  permissionChecks.push(resource+':'+action);
 },allowed:async()=>true} as unknown as RbacEngine;
 const service=new NamedCredentialService(db,rbac);
 await assert.rejects(service.enqueueFlowEmail(client,tenant,user,flowId,2,runId,4,7,credential,
  'sales@example.com',['buyer@example.com','owner@example.com'],'Order updated','Hello'),
  /SMTP email delivery has been removed/);
 assert.deepEqual(permissionChecks,['Email:send','NamedCredential:read']);
 assert.equal(inserted,false);
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
