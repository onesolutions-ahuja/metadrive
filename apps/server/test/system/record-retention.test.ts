import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RecordRetentionService} from '../../src/system-support/record-retention-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

const tenant='00000000-0000-4000-8000-000000000051';
const owner='00000000-0000-4000-8000-000000000052';
const record='00000000-0000-4000-8000-000000000053';
const group='00000000-0000-4000-8000-000000000054';

test('record retention defaults to disabled and requires Security:manage',async()=>{
 const checks:string[]=[];
 const db={query:async()=>({rows:[],rowCount:0})} as unknown as SqlPersistence;
 const rbac={require:async(_tenant:string,_owner:string,res:string,action:string)=>{
  checks.push(res+':'+action);
 }} as unknown as RbacEngine;
 const service=new RecordRetentionService(db,rbac);
 assert.deepEqual(await service.get(tenant,owner),{retentionDays:15,automaticPurgeEnabled:false});
 assert.ok(checks.includes('Security:manage'));
 await assert.rejects(()=>service.set(tenant,owner,0,true),/Invalid retention configuration/);
 await assert.rejects(()=>service.set(tenant,owner,15,'true'),/Invalid retention configuration/);
});

test('retention changes persist as tenant-scoped SQL and audit the actor',async()=>{
 const calls:Array<{sql:string;args:unknown[]}>= [];
 const client={query:async(sql:string,args:unknown[])=>{
  calls.push({sql,args});return {rows:[],rowCount:1};
 }};
 const db={transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const svc=new RecordRetentionService(db,rbac);
 assert.deepEqual(await svc.set(tenant,owner,30,true),
  {retentionDays:30,automaticPurgeEnabled:true});
 assert.ok(calls.some(c=>c.sql.includes('INSERT INTO md_record_retention_settings')&&
   c.args.includes(tenant)&&c.args.includes(owner)&&c.args.includes(30)));
 assert.ok(calls.some(c=>c.sql.includes('INSERT INTO md_record_retention_audit')));
});

test('purge refuses an unexpired record and retains all data',async()=>{
 const calls:string[]=[];
 const client={query:async(sql:string)=>{
  calls.push(sql);
  if(sql.includes('SELECT deletion_group_id FROM md_records'))
   return {rows:[{deletion_group_id:group}],rowCount:1};
  if(sql.includes('SELECT retention_days'))return {rows:[{retention_days:15}],rowCount:1};
  if(sql.includes('ORDER BY object_api,id FOR UPDATE'))return {rows:[],rowCount:0};
  if(sql.includes('SELECT id FROM md_records'))return {rows:[{id:record}],rowCount:1};
  return {rows:[],rowCount:0};
 }};
 const db={transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
 const rbac={require:async()=>{},requireRecord:async()=>{}} as unknown as RbacEngine;
 await assert.rejects(()=>new RecordRetentionService(db,rbac).purge(tenant,owner,'Account__c',record),
  /retention period has not expired/);
 assert.ok(!calls.some(sql=>sql.startsWith('DELETE FROM md_records')));
});

test('purge fails closed on external references and pending approvals',async()=>{
 for(const blocker of ['foreign','pending'] as const){
  const calls:string[]=[];
  const client={query:async(sql:string)=>{
   calls.push(sql);
   if(sql.includes('SELECT deletion_group_id FROM md_records'))
    return {rows:[{deletion_group_id:group}],rowCount:1};
   if(sql.includes('SELECT retention_days'))return {rows:[{retention_days:1}],rowCount:1};
   if(sql.includes('ORDER BY object_api,id FOR UPDATE'))
    return {rows:[{id:record,object_api:'Account__c'}],rowCount:1};
   if(sql.includes('SELECT id FROM md_records'))return {rows:[{id:record}],rowCount:1};
   if(sql.includes('FROM md_record_values v')&&blocker==='foreign')
    return {rows:[{present:1}],rowCount:1};
   if(sql.includes('FROM md_approval_requests')&&blocker==='pending')
    return {rows:[{present:1}],rowCount:1};
   return {rows:[],rowCount:0};
  }};
  const db={transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
  const rbac={require:async()=>{},requireRecord:async()=>{}} as unknown as RbacEngine;
  await assert.rejects(()=>new RecordRetentionService(db,rbac).purge(tenant,owner,'Account__c',record),
   /Purge blocked/);
  assert.ok(!calls.some(sql=>sql.startsWith('DELETE FROM md_records')));
 }
});

test('automated retention does not delete records without an opted-in policy',async()=>{
 const calls:string[]=[];
 const db={query:async(sql:string)=>{calls.push(sql);return {rows:[],rowCount:0};}} as unknown as SqlPersistence;
 const rbac={require:async()=>{throw new Error('Should not require RBAC without a candidate');}} as unknown as RbacEngine;
 assert.deepEqual(await new RecordRetentionService(db,rbac).purgeExpired(),{purged:0,blocked:0});
 assert.ok(calls[0].includes('s.automatic_purge_enabled=true'));
});
