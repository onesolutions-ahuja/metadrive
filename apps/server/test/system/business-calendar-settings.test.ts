import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PlatformTenantService} from '../../src/system-files/platform-tenant-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

const calendar={
 fiscalYearStart:{month:4,day:6},timezone:'Europe/London',
 weeklyHours:{
  monday:{closed:false,open:'09:31',close:'17:01'},
  tuesday:{closed:false,open:'09:00',close:'17:00'},
  wednesday:{closed:false,open:'09:00',close:'17:00'},
  thursday:{closed:false,open:'09:00',close:'17:00'},
  friday:{closed:false,open:'09:00',close:'16:00'},
  saturday:{closed:true,open:'09:00',close:'17:00'},
  sunday:{closed:true,open:'09:00',close:'17:00'}
 },
 holidays:[{date:'2026-12-25',label:'Christmas Day'}]
};

test('business calendar is validated, tenant-scoped, and audited transactionally',async()=>{
 const writes:Array<{sql:string;args:unknown[]}>= [];
 const txClient={query:async(sql:string,args:unknown[]=[])=>(writes.push({sql,args}),{
  rows:sql.includes('RETURNING properties')?[{properties:JSON.parse(String(args[1]))}]:[],rowCount:1
 })};
 const db={
  transaction:async<T>(run:(client:typeof txClient)=>Promise<T>)=>run(txClient),
  query:async(sql:string,args:unknown[]=[])=>{
   assert.match(sql,/SELECT properties FROM md_tenant_settings/);
   assert.deepEqual(args,['tenant-1']);
   return {rows:[{properties:calendar}],rowCount:1};
  }
 } as unknown as SqlPersistence;
 const grants:Array<string>=[];
 const rbac={require:async(_tenant:string,_user:string,resource:string,action:string)=>{
  grants.push(resource+':'+action);
 }} as unknown as RbacEngine;
 const saved=await new PlatformTenantService(db,rbac).saveSetting('tenant-1','user-1','business-calendar',calendar);
 assert.deepEqual(saved,calendar);
 assert.deepEqual(grants,['TenantSettings:manage']);
 assert.ok(writes[0].sql.includes('md_tenant_settings'));
 assert.deepEqual(writes[0].args,['tenant-1',JSON.stringify(calendar)]);
 assert.ok(writes.some(write=>write.sql.includes('tenant.business-calendar.updated')));
});

test('AceAssist business calendar read returns saved tenant settings for its caller',async()=>{
 const reads:Array<{sql:string;args:unknown[]}>= [];
 const db={query:async(sql:string,args:unknown[]=[])=>(reads.push({sql,args}),{
  rows:[{properties:calendar}]
 })} as unknown as SqlPersistence;
 const grants:Array<string>=[];
 const rbac={allowed:async(tenant:string,user:string,resource:string,action:string)=>{
  grants.push([tenant,user,resource,action].join(':'));
  return true;
 }} as unknown as RbacEngine;
 const saved=await new PlatformTenantService(db,rbac).getBusinessCalendar('tenant-1','user-1');
 assert.deepEqual(saved,calendar);
 assert.deepEqual(grants,['tenant-1:user-1:BusinessCalendar:read']);
 assert.ok(reads[0].sql.includes('md_tenant_settings'));
 assert.deepEqual(reads[0].args,['tenant-1']);
});

test('business calendar rejects invalid timezone, hours and holiday dates before writing',async()=>{
 let transactions=0;
 const db={transaction:async()=>{transactions++;throw Error('Unexpected write')}} as unknown as SqlPersistence;
 const service=new PlatformTenantService(db,{require:async()=>undefined} as unknown as RbacEngine);
 await assert.rejects(()=>service.saveSetting('tenant','user','business-calendar',{
  ...calendar,timezone:'Not/AZone'
 }),/time zone/);
 await assert.rejects(()=>service.saveSetting('tenant','user','business-calendar',{
  ...calendar,weeklyHours:{...calendar.weeklyHours,monday:{closed:false,open:'18:00',close:'09:00'}}
 }),/business hours/);
 await assert.rejects(()=>service.saveSetting('tenant','user','business-calendar',{
  ...calendar,holidays:[{date:'2026-02-30',label:'Invalid date'}]
 }),/holiday/);
 assert.equal(transactions,0);
});

test('saved business hours read back only under the same authenticated tenant',async()=>{
 const settings=new Map<string,unknown>();
 const query=async(sql:string,args:unknown[]=[]):Promise<{rows:Array<{properties:unknown}>;rowCount:number}>=>{
  if(sql.includes('INSERT INTO md_tenant_settings')){
   const properties=JSON.parse(String(args[1])) as unknown;
   settings.set(String(args[0]),properties);
   return {rows:[{properties}],rowCount:1};
  }
  if(sql.includes('SELECT properties FROM md_tenant_settings')){
   const value=settings.get(String(args[0]));
   return {rows:value?[{properties:value}]:[],rowCount:value?1:0};
  }
  return {rows:[],rowCount:0};
 };
 const db=({query,transaction:async<T>(run:(client:{query:typeof query})=>Promise<T>)=>run({query})}) as unknown as SqlPersistence;
 const rbac={allowed:async()=>true,require:async()=>undefined} as unknown as RbacEngine;
 const service=new PlatformTenantService(db,rbac);
 assert.deepEqual(await service.saveSetting('tenant-one','user-one','business-calendar',calendar),calendar);
 assert.deepEqual(await service.getBusinessCalendar('tenant-one','user-one'),calendar);
 assert.equal(await service.getBusinessCalendar('tenant-two','user-two'),null);
});

test('calendar save never claims success when the committed tenant row is missing',async()=>{
 const query=async(sql:string,args:unknown[]=[])=>({
  rows:sql.includes('RETURNING properties')?[{properties:JSON.parse(String(args[1]))}]:[],
  rowCount:sql.includes('RETURNING properties')?1:0
 });
 const db={
  transaction:async<T>(run:(client:{query:typeof query})=>Promise<T>)=>run({query}),
  query:async()=>({rows:[],rowCount:0})
 } as unknown as SqlPersistence;
 const service=new PlatformTenantService(db,{
  require:async()=>undefined
 } as unknown as RbacEngine);
 await assert.rejects(()=>service.saveSetting('tenant-1','user-1','business-calendar',calendar),
  /not confirmed after commit/);
});

test('calendar save rejects a changed result before falsely confirming',async()=>{
 const query=async(sql:string,args:unknown[]=[])=>({
  rows:sql.includes('RETURNING properties')?
   [{properties:{...calendar,timezone:'UTC'}}]:[],rowCount:1
 });
 const db={
  transaction:async<T>(run:(client:{query:typeof query})=>Promise<T>)=>run({query}),
  query:async()=>({rows:[{properties:calendar}],rowCount:1})
 } as unknown as SqlPersistence;
 const service=new PlatformTenantService(db,{require:async()=>undefined} as unknown as RbacEngine);
 await assert.rejects(()=>service.saveSetting('tenant-1','user-1','business-calendar',calendar),
  /unexpected settings/);
});
