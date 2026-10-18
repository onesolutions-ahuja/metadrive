import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {PermissionSetAdministration} from '../../src/system-support/permission-set-administration.js';

const id='12345678-1234-4234-8234-123456789abc';
const set={id,apiName:'Cashier',label:'Cashier',systemPermissions:['FlowDefinition:read'],
  objectPermissions:{Invoice:{read:true,create:true,edit:false}},fieldPermissions:{'Invoice.Total':{read:true,edit:false}}};
test('permission set writes only tenant-scoped SQL grants',async()=>{
 const sql:string[]=[];
 const db={transaction:async(fn:(tx:any)=>Promise<unknown>)=>fn({query:async(query:string,args:unknown[])=>{
   assert.equal(args[0],'tenant');sql.push(query);
   if(query.includes('SELECT id,api_name FROM md_permission_sets'))return {rows:[]};
   if(query.includes('SELECT permission_set_id FROM md_permission_assignments'))return {rows:[]};
   if(query.includes('SELECT resource,action,effect'))return {rows:[]};
   return {rows:[]};
 }})} as unknown as SqlPersistence;
 const rbac={require:async()=>{},describe:async()=>({tenantId:'tenant'})} as unknown as RbacEngine;
 const output=await new PermissionSetAdministration(db,rbac).save('tenant','admin',{permissionSets:[set]});
 assert.deepEqual(output,{tenantId:'tenant'});
 assert.ok(sql.some(q=>q.includes('INSERT INTO md_permission_rules')));
 assert.ok(!sql.some(q=>q.includes('UPDATE md_users')));
});
test('permission set rejects wildcard grants and malformed fields',async()=>{
 const db={transaction:async()=>{throw Error('SQL should not be reached')}} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const service=new PermissionSetAdministration(db,rbac);
 await assert.rejects(()=>service.save('tenant','admin',{permissionSets:[{...set,systemPermissions:['Security:*']}]}),/Invalid system permission|Wildcard/);
 await assert.rejects(()=>service.save('tenant','admin',{permissionSets:[{...set,fieldPermissions:{'Invoice..Total':{edit:true}}}]}),/Invalid field grant/);
});
test('permission set write checks OneEngine Security manage first',async()=>{
 const db={} as SqlPersistence;
 const rbac={require:async()=>{throw Error('Permission denied')}} as unknown as RbacEngine;
 await assert.rejects(()=>new PermissionSetAdministration(db,rbac).save('tenant','actor',{permissionSets:[]}),/Permission denied/);
});

test('existing OneEngine wildcard grant remains configurable by authorised RBAC administrator',async()=>{
 const writes:string[]=[];
 const db={transaction:async(fn:(tx:any)=>Promise<unknown>)=>fn({query:async(sql:string,args:unknown[])=>{
   writes.push(sql);
   if(sql.includes('SELECT id,api_name FROM md_permission_sets'))return {rows:[{id,api_name:'Cashier'}]};
   if(sql.includes('SELECT permission_set_id FROM md_permission_assignments'))return {rows:[]};
   if(sql.includes('SELECT resource,action,effect'))return {rows:[{resource:'*',action:'*',effect:'allow'}]};
   return {rows:[]};
 }})} as unknown as SqlPersistence;
 const rbac={require:async()=>{},describe:async()=>({})} as unknown as RbacEngine;
 await new PermissionSetAdministration(db,rbac).save('tenant','admin',{permissionSets:[{...set,systemPermissions:['*:*',...set.systemPermissions]}]});
 assert.ok(!writes.some(sql=>sql.startsWith('DELETE FROM md_permission_rules')));
 await new PermissionSetAdministration(db,rbac).save('tenant','admin',{permissionSets:[set]});
 assert.ok(writes.some(sql=>sql.startsWith('DELETE FROM md_permission_rules')));
});
