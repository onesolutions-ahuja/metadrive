import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {NativeTenantRecordReader} from '../../src/system-support/native-tenant-records.js';

const actor={
  tenant_id:'8e4f5288-3284-444c-93e6-f3665943afd5',
  user_id:'25db9751-b190-4c5a-ae18-1d3111044200'
};

test('native Tenant lookup searches only the current tenant and returns real IDs',async()=>{
  const queried:unknown[][]=[];
  const db={query:async(sql:string,args:unknown[])=>{
    assert.match(sql,/FROM md_tenants WHERE id=\$1/);
    queried.push(args);
    return {rows:[{id:actor.tenant_id,name:'UNE Solutions',slug:'une'}]};
  }} as unknown as SqlPersistence;
  const checked:string[]=[];
  const rbac={
    require:async(_tenant:string,_user:string,resource:string,action:string)=>{
      checked.push(resource+':'+action);
    },
    allowedMany:async()=>[true,true]
  } as unknown as RbacEngine;
  const lookup=new NativeTenantRecordReader(db,rbac);
  assert.deepEqual(await lookup.list(actor,20,0,'UNE'),{
    records:[{Id:actor.tenant_id,Name:'UNE Solutions',Slug:'une'}],total:1
  });
  assert.deepEqual(await lookup.list(actor,20,0,'no match'),{records:[],total:0});
  assert.deepEqual(await lookup.list(actor,20,1,'une'),{records:[],total:1});
  assert.deepEqual(queried,[[actor.tenant_id],[actor.tenant_id],[actor.tenant_id]]);
  assert.deepEqual(checked,['Tenant:read','Tenant:read','Tenant:read']);
  assert.deepEqual(await lookup.get(actor,actor.tenant_id),{
    record:{Id:actor.tenant_id,Name:'UNE Solutions',Slug:'une'}
  });
  await assert.rejects(()=>lookup.get(actor,'c1ce459d-9b01-4c38-8e20-2598991b40dd'),/Record not found/);
});

test('native Tenant lookup respects field permissions and fails closed on object access',async()=>{
  const db={query:async()=>({rows:[{id:actor.tenant_id,name:'Secret tenant',slug:'internal'}]})} as unknown as SqlPersistence;
  const rbac={
    require:async()=>{},
    allowedMany:async()=>[false,true]
  } as unknown as RbacEngine;
  const lookup=new NativeTenantRecordReader(db,rbac);
  assert.deepEqual(await lookup.list(actor,50,0,'Secret'),{records:[],total:0});
  assert.deepEqual(await lookup.list(actor,50,0,'internal'),{
    records:[{Id:actor.tenant_id,Slug:'internal'}],total:1
  });
  await assert.rejects(()=>lookup.list(actor,0,0,''),/Invalid pagination/);
  await assert.rejects(()=>lookup.list(actor,50,-1,''),/Invalid pagination/);
  await assert.rejects(()=>lookup.list(actor,50,0,['bad']),/Invalid record list query/);
  const denied={
    require:async()=>{throw new Error('Permission denied');},
    allowedMany:async()=>[true,true]
  } as unknown as RbacEngine;
  await assert.rejects(()=>new NativeTenantRecordReader(db,denied).list(actor,10,0,'une'),/Permission denied/);
});
