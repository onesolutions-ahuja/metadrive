import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PlatformTenantService} from '../../src/system-files/platform-tenant-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

const recordId='0e9d9dc4-a769-4cc7-957b-816a13d0ff62';
const briefcase={selections:[{objectApi:'Account',recordIds:[recordId]}]};

test('offline briefcase selections are tenant-settings managed and audit identifiers are omitted',async()=>{
 const writes:Array<{sql:string;args:unknown[]}>= [];
 const transactionClient={query:async(sql:string,args:unknown[]=[])=>(writes.push({sql,args}),{
  rows:sql.includes('RETURNING properties')?[{properties:JSON.parse(String(args[1]))}]:[],rowCount:1
 })};
  const transaction=async<T>(run:(client:typeof transactionClient)=>Promise<T>):Promise<T>=>run(transactionClient);
  const db={transaction} as unknown as SqlPersistence;
 const grants:Array<string>=[];
 const rbac={require:async(_tenant:string,_user:string,resource:string,action:string)=>{
  grants.push(resource+':'+action);
 }} as unknown as RbacEngine;

 const saved=await new PlatformTenantService(db,rbac).saveSetting('tenant-1','user-1','offline-briefcase',briefcase);
 assert.deepEqual(saved,briefcase);
 assert.deepEqual(grants,['TenantSettings:manage']);
 assert.ok(writes[0].sql.includes('md_tenant_settings'));
 const audit=writes.find(write=>write.sql.includes('tenant.offline-briefcase.updated'));
 assert.ok(audit);
 assert.deepEqual(JSON.parse(String(audit.args[2])),{objects:['Account'],recordCount:1});
 assert.equal(JSON.stringify(audit.args).includes(recordId),false);
});

test('offline briefcase rejects invalid, duplicated, and oversized selections before writing',async()=>{
 let transactions=0;
 const db={transaction:async()=>{transactions++;throw Error('Unexpected write')}} as unknown as SqlPersistence;
 const service=new PlatformTenantService(db,{require:async()=>undefined} as unknown as RbacEngine);

 await assert.rejects(()=>service.saveSetting('tenant','user','offline-briefcase',{
  selections:[{objectApi:'Account;DROP',recordIds:[recordId]}]
 }),/Invalid offline briefcase selection/);
 await assert.rejects(()=>service.saveSetting('tenant','user','offline-briefcase',{
  selections:[{objectApi:'Account',recordIds:[recordId,recordId]}]
 }),/Invalid offline briefcase selection/);
 await assert.rejects(()=>service.saveSetting('tenant','user','offline-briefcase',{
  selections:Array.from({length:21},(_,index)=>({objectApi:`Object${index}`,recordIds:[recordId]}))
 }),/Invalid offline briefcase configuration/);
 await assert.rejects(()=>service.saveSetting('tenant','user','offline-briefcase',{
  selections:Array.from({length:3},(_,index)=>({
   objectApi:`Object${index}`,recordIds:Array.from({length:50},(_,id)=>`00000000-0000-4000-8000-${String(index*50+id+1).padStart(12,'0')}`)
  }))
 }),/more than 100 records/);
 assert.equal(transactions,0);
});
