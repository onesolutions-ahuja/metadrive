import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PlatformTenantService} from '../../src/system-files/platform-tenant-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

test('tenant list binds every SQL argument including pagination and default search',async()=>{
 const queries:Array<{sql:string;args:unknown[]}>=[],db={
  query:async(sql:string,args:unknown[])=>{queries.push({sql,args});return {rows:sql.includes('AS authorised')?[{authorised:false}]:sql.includes('AS total')?[{total:'1'}]:[{id:'t',slug:'tenant',name:'Tenant',users:'1',active_users:'1'}]};}
 } as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const result=await new PlatformTenantService(db,rbac).list('00000000-0000-4000-8000-000000000001','u',{status:'ALL',page:1,pageSize:25});
 assert.equal(result.total,1);
 assert.match(queries[1].sql,/LIMIT \$4 OFFSET \$5/);
 assert.deepEqual(queries[1].args,['00000000-0000-4000-8000-000000000001',null,true,25,0]);
 assert.deepEqual(queries[2].args,['00000000-0000-4000-8000-000000000001',null,true]);
});
