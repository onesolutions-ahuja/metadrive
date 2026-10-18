import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoleAdministration } from '../../src/system-support/role-administration.js';
import type { SqlPersistence } from '../../src/system-files/sql-persistence.js';
import type { RbacEngine } from '../../src/system-files/rbac-engine.js';

const role={id:'11111111-1111-4111-8111-111111111111',apiName:'TillCashier',name:'Till User / Cashier',parentRoleId:null};

test('SQL role editor creates only tenant-scoped role metadata with no permission grants',async()=>{
  const statements:string[]=[];
  const client={query:async(sql:string,args:unknown[])=>{
    statements.push(sql);
    assert.equal(args[0],'tenant-a');
    if(sql.includes('SELECT id FROM md_roles'))return {rows:[]};
    if(sql.includes('SELECT u.id,ur.role_id'))return {rows:[]};
    return {rows:[],rowCount:1};
  }};
  const db={transaction:async(fn:(client:typeof client)=>Promise<unknown>)=>fn(client)} as unknown as SqlPersistence;
  const granted:string[]=[];
  const rbac={require:async(_t:string,_u:string,resource:string,action:string)=>{granted.push(resource+':'+action);},
    describe:async()=>({tenantId:'tenant-a',roles:[role]})} as unknown as RbacEngine;
  const result=await new RoleAdministration(db,rbac).save('tenant-a','admin',{roles:[role],users:[]});
  assert.deepEqual(result,{tenantId:'tenant-a',roles:[role]});
  assert.deepEqual(granted,['Security:manage']);
  assert.ok(statements.some(s=>s.includes('INSERT INTO md_roles')));
  assert.ok(statements.every(s=>!s.includes('INSERT INTO md_permission_rules')));
});

test('SQL role editor refuses invalid requests before writing',async()=>{
  let writes=0;
  const db={transaction:async()=>{writes++;}} as unknown as SqlPersistence;
  const rbac={require:async()=>{},describe:async()=>({})} as unknown as RbacEngine;
  const service=new RoleAdministration(db,rbac);
  await assert.rejects(()=>service.save('tenant','admin',{roles:[{...role,parentRoleId:role.id}],users:[]}),/role hierarchy/);
  await assert.rejects(()=>service.save('tenant','admin',{roles:[role],users:[],permissionSets:[]}),/Invalid role administration/);
  assert.equal(writes,0);
});

test('SQL role editor denies callers without OneEngine Security manage',async()=>{
  const db={transaction:async()=>{throw Error('must not reach SQL writes');}} as unknown as SqlPersistence;
  const rbac={require:async()=>{throw Error('Permission denied');}} as unknown as RbacEngine;
  await assert.rejects(()=>new RoleAdministration(db,rbac).save('tenant','user',{roles:[],users:[]}),/Permission denied/);
});
