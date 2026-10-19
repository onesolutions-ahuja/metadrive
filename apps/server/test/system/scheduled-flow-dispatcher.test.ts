import assert from 'node:assert/strict';
import test from 'node:test';
import {encodeMetadataValue} from '../../src/system-files/component-runtime.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {ScheduledFlowDispatcher} from '../../src/system-support/scheduled-flow-dispatcher.js';

const tenant='00000000-0000-4000-8000-000000000001';
const actor='00000000-0000-4000-8000-000000000002';
const flowId='00000000-0000-4000-8000-000000000003';
function makeDispatcher(options:{appActive?:boolean;startDate?:string;startTime?:string;
 timeZone?:string;frequency?:string;appApiName?:string}={}) {
 const flow={id:flowId,tenant_id:tenant,api_name:'DailyFlow',version:4,
  flow_service_user_id:actor,app_api_name:options.appApiName??null};
 const metadata:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue({builder:{
  elements:[{id:1,type:'Start',config:{
   object:'Account',startDate:options.startDate??'2026-10-31',
   startTime:options.startTime??'09:30',timeZone:options.timeZone??'UTC',
   frequency:options.frequency??'Once',entryConditions:[]
  }}],
  ...(options.appApiName?{appApiName:options.appApiName}:{})
 }},'',metadata);
 const enqueued:Array<{kind:string;params:unknown[]}>=[];
 const db={
  query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
   if(sql.includes('FROM md_flow_definitions f'))return {rows:[flow]};
   if(sql.includes('FROM md_flow_editor_values'))return {rows:metadata.map(row=>({
    property_path:row.path,value_kind:row.kind,value_text:row.text
   }))};
   if(sql.includes('FROM md_apps a'))return {rows:options.appActive===false?[]:[{exists:true}]};
   if(sql.includes('INSERT INTO md_durable_jobs')){
    enqueued.push({kind:String(params[1]),params});return {rows:[{id:'job-id'}]};
   }
   throw new Error('Unexpected dispatcher SQL: '+sql);
  }
 } as unknown as SqlPersistence;
 return {dispatcher:new ScheduledFlowDispatcher(db),enqueued};
}

test('scheduled dispatcher enqueues the due occurrence for the configured tenant service user',async()=>{
 const {dispatcher,enqueued}=makeDispatcher();
 await dispatcher.enqueueDue(new Date('2026-10-31T09:35:00.000Z'));
 assert.equal(enqueued.length,1);
 assert.equal(enqueued[0].kind,'flow.scheduled');
 assert.equal(enqueued[0].params[0],tenant);
 assert.equal(enqueued[0].params[2],actor);
 assert.equal(enqueued[0].params[4],'DailyFlow');
 assert.equal(enqueued[0].params[9],4);
 assert.equal((enqueued[0].params[5] as Date).toISOString(),'2026-10-31T09:30:00.000Z');
 assert.match(String(enqueued[0].params[6]),/^flow-scheduled:[a-f0-9]{64}$/);
});

test('scheduled dispatcher does not enqueue a Flow for an uninstalled or unentitled app',async()=>{
 const {dispatcher,enqueued}=makeDispatcher({appApiName:'Billing',appActive:false});
 await dispatcher.enqueueDue(new Date('2026-10-31T09:35:00.000Z'));
 assert.equal(enqueued.length,0);
});

test('scheduled dispatcher rejects nonexistent local daylight-saving times',async()=>{
 const {dispatcher}=makeDispatcher({startDate:'2026-03-08',startTime:'02:30',
  timeZone:'America/New_York'});
 await assert.rejects(dispatcher.enqueueDue(new Date('2026-03-08T10:00:00.000Z')),
  /local time does not exist/);
});

test('dispatcher pages through more than 500 tenant schedules without skipping later tenants',async()=>{
 const metadata:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue({builder:{elements:[{id:1,type:'Start',config:{
  object:'Account',startDate:'2026-10-31',startTime:'09:30',
  timeZone:'UTC',frequency:'Daily'
 }}]}},'',metadata);
 const flows=Array.from({length:501},(_,i)=>({
  id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
  tenant_id:tenant,api_name:'Flow_'+String(i+1).padStart(4,'0'),
  version:1,flow_service_user_id:actor,app_api_name:null
 }));
 let cursorReads=0,queued=0;
 const db={query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
  if(sql.includes('FROM md_flow_definitions f')){
   const last=cursorReads*200;
   if(cursorReads>0)assert.equal(params[3],flows[last-1].id,
    'Keyset cursor must identify last schedule from preceding batch');
   cursorReads++;
   return {rows:flows.slice(last,last+200)};
  }
  if(sql.includes('FROM md_flow_editor_values'))return {rows:metadata.map(row=>({
   property_path:row.path,value_kind:row.kind,value_text:row.text
  }))};
  if(sql.includes('INSERT INTO md_durable_jobs')){
   queued++;return {rows:[{id:'job-id'}]};
  }
  throw new Error('Unexpected dispatcher query: '+sql);
 }} as unknown as SqlPersistence;
 const processed=await new ScheduledFlowDispatcher(db).enqueueDue(
  new Date('2026-11-01T09:35:00Z'));
 assert.equal(processed,501);
 assert.equal(queued,501);
 assert.equal(cursorReads,3);
});
