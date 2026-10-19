import assert from 'node:assert/strict';
import test from 'node:test';
import type {PoolClient} from 'pg';
import {cancelScheduledPathInterviews,syncFlowTriggerSubscription} from '../../src/system-files/flow-subscription-runtime.js';

test('active automatic Flow versions replace older tenant subscriptions transactionally',async()=>{
 const calls:Array<{sql:string;params:unknown[]}>=[];
 const client={query:async(sql:string,params:unknown[]=[])=>
  {calls.push({sql,params});return {rows:[]};}} as unknown as PoolClient;
 await syncFlowTriggerSubscription(client,'tenant-a','DailyFlow','flow-v4',{
  active:true,flowType:'Schedule-Triggered Flow',appApiName:'Billing',
  elements:[{id:1,type:'Start',config:{object:'Account'}}]
 });
 assert.equal(calls.length,2);
 assert.match(calls[0].sql,/UPDATE md_flow_trigger_subscriptions SET active=false/);
 assert.match(calls[1].sql,/INSERT INTO md_flow_trigger_subscriptions/);
 assert.deepEqual(calls[1].params,['tenant-a','flow-v4','Schedule-Triggered Flow','Account','Billing']);
});

test('inactive and non-trigger Flow versions cannot retain an automatic subscription',async()=>{
 for(const flow of [
  {active:false,flowType:'Schedule-Triggered Flow'},
  {active:true,flowType:'Autolaunched Flow'}
 ]){
  const statements:string[]=[];
  const client={query:async(sql:string)=>{statements.push(sql);return {rows:[]};}} as unknown as PoolClient;
  await syncFlowTriggerSubscription(client,'tenant-a','MyFlow','flow-id',{
   ...flow,elements:[{id:1,type:'Start',config:{object:'Account'}}]
  });
  assert.equal(statements.length,1);
 }
});

test('Flow activation and deactivation cancel obsolete durable Scheduled Path interviews',async()=>{
 const calls:Array<{sql:string;params:unknown[]}>= [];
 const client={query:async(sql:string,params:unknown[]=[])=>
  {calls.push({sql,params});return {rows:[]};}} as unknown as PoolClient;
 await cancelScheduledPathInterviews(client,'tenant-a','MyFlow','active-version');
 assert.equal(calls.length,1);
 assert.match(calls[0].sql,/wait_kind='scheduled-path'/);
 assert.match(calls[0].sql,/UPDATE md_durable_jobs/);
 assert.deepEqual(calls[0].params,['tenant-a','MyFlow','active-version']);
});
