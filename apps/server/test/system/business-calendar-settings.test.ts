import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PlatformTenantService} from '../../src/system-files/platform-tenant-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

const calendar={
 fiscalYearStart:{month:4,day:1},timezone:'Europe/London',
 weeklyHours:{
  monday:{closed:false,open:'09:00',close:'17:00'},
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
  transaction:async<T>(run:(client:typeof txClient)=>Promise<T>)=>run(txClient)
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
