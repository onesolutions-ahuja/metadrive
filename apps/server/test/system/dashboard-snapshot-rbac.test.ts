import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {RecordEngine} from '../../src/system-files/record-engine.js';
import type {SystemDefinitionService} from '../../src/system-files/system-definition-service.js';
import {DashboardSnapshotService} from '../../src/system-support/dashboard-snapshot-service.js';

test('previously saved snapshot is withheld after row access is revoked',async()=>{
 const id='123e4567-e89b-42d3-a456-426614174000';
 const calls:unknown[][]=[];
 const definitions={list:async()=>[{
  apiName:'Sales',status:'Deployed',visibility:'All Users',components:[],filters:[]}]} as unknown as SystemDefinitionService;
 const db={query:async(sql:string,args:unknown[])=>{
  calls.push(args);
  if(sql.includes('FROM md_dashboard_snapshots'))return {rows:[{
   id,created_at:new Date(),content:{components:[{objectApiName:'Product',
    sourceRecordIds:[id],sourceFieldApiNames:['Name']}]}}]};
  if(sql.includes('md_record_access'))return {rows:[{n:0}]};
  throw Error('Unexpected SQL');
 }} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const records={} as RecordEngine;
 const svc=new DashboardSnapshotService(db,rbac,records,definitions);
 assert.deepEqual(await svc.list({tenant_id:'tenant',user_id:'user'},'Sales'),[]);
 assert.equal(calls.length,2);
 assert.ok(calls.every(args=>args[0]==='tenant'));
});
test('dashboard captures cannot impersonate a running user',async()=>{
 let recordsTouched=false;
 const definitions={list:async()=>[{
  apiName:'Sales',status:'Deployed',visibility:'All Users',components:[],filters:[]}]} as unknown as SystemDefinitionService;
 const svc=new DashboardSnapshotService({query:async()=>{throw Error('Unexpected SQL');}} as unknown as SqlPersistence,
  {require:async()=>{}} as unknown as RbacEngine,
  {list:async()=>{recordsTouched=true;return {records:[],total:0};}} as unknown as RecordEngine,
  definitions);
 await assert.rejects(()=>svc.create({tenant_id:'tenant',user_id:'user'},'Sales',{
  label:'Snapshot',filters:[],crossFilters:[],customComponents:[],runningUserId:'other'}),/Unsupported dashboard snapshot/);
 assert.equal(recordsTouched,false);
});
