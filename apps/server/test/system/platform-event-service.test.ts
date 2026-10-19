import assert from 'node:assert/strict';
import test from 'node:test';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {PlatformEventService} from '../../src/system-support/platform-event-service.js';

const tenant='00000000-0000-4000-8000-000000000001';
const user='00000000-0000-4000-8000-000000000002';
const eventFields=[
 {field_api:'OrderNumber__c',data_type:'Text(255)',required:true,picklist_restricted:false},
 {field_api:'Total__c',data_type:'Currency',required:false,picklist_restricted:false},
 {field_api:'Paid__c',data_type:'Checkbox',required:false,picklist_restricted:false}
];

function createService(options:{existing?:boolean}={}) {
 const writes:Array<{sql:string;params:unknown[]}>=[];
 const db={
  query:async(sql:string)=>{
   if(sql.includes('FROM md_system_definitions'))return {rows:[{api_name:'Order_Updated__e'}]};
   throw new Error('Unexpected Platform Event query: '+sql);
  },
  transaction:async<T>(callback:(client:{query:(sql:string,params?:unknown[])=>Promise<{rows:Array<Record<string,unknown>>}>})=>Promise<T>)=>
   callback({query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
    writes.push({sql,params});
     if(sql.includes('FROM md_system_definitions'))return {rows:[{api_name:'Order_Updated__e'}]};
    if(sql.includes('FROM md_platform_event_fields'))return {rows:eventFields};
    if(sql.includes('FROM md_platform_event_picklist_values'))return {rows:[]};
    if(sql.includes('INSERT INTO md_platform_event_messages'))
     return {rows:options.existing?[]:[{id:'event-id'}]};
    if(sql.includes('SELECT id FROM md_platform_event_messages'))
     return {rows:[{id:'event-id'}]};
    return {rows:[]};
   }})
 } as unknown as SqlPersistence;
 const checks:string[]=[];
 const rbac={require:async(_tenant:string,_user:string,resource:string,action:string)=>{
  checks.push(resource+':'+action);
 }} as unknown as RbacEngine;
 return {service:new PlatformEventService(db,rbac),writes,checks};
}

test('Platform Event publication validates fields and persists typed values with audit',async()=>{
 const {service,writes,checks}=createService();
 const result=await service.publish(tenant,user,'Order_Updated__e',{
  idempotencyKey:'order-17',values:{OrderNumber__c:'A-17',Total__c:12.5,Paid__c:true}
 });
 assert.deepEqual(result,{eventId:'event-id',status:'pending'});
 assert.deepEqual(checks,['PlatformEvent:Order_Updated__e:publish']);
 assert.equal(writes.filter(write=>write.sql.includes('INSERT INTO md_platform_event_values')).length,3);
 assert(writes.some(write=>write.sql.includes('platform-event.publish')));
 assert.equal(writes.find(write=>write.sql.includes('INSERT INTO md_platform_event_values'))?.params[3],'string');
});

test('Platform Event idempotency returns the existing event without duplicate values',async()=>{
 const {service,writes}=createService({existing:true});
 const result=await service.publish(tenant,user,'Order_Updated__e',{
  idempotencyKey:'order-17',values:{OrderNumber__c:'A-17'}
 });
 assert.deepEqual(result,{eventId:'event-id',status:'pending'});
 assert.equal(writes.filter(write=>write.sql.includes('INSERT INTO md_platform_event_values')).length,0);
});

test('Platform Event publication rejects unknown fields and missing required values',async()=>{
 const {service,writes}=createService();
 await assert.rejects(service.publish(tenant,user,'Order_Updated__e',{
  values:{OrderNumber__c:'A-17',Unexpected__c:'bad'}
 }),/unknown field/);
 await assert.rejects(service.publish(tenant,user,'Order_Updated__e',{
  values:{Total__c:1}
 }),/Required Platform Event field/);
 assert.equal(writes.filter(write=>write.sql.includes('INSERT INTO md_platform_event_messages')
  ||write.sql.includes('INSERT INTO md_platform_event_values')).length,0);
});
