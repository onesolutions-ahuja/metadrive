import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFlowApprovalOutcome,finishFlowOrchestrationDecision} from
 '../../src/system-files/flow-orchestration-runtime.js';
import type {PoolClient} from 'pg';
import {readFileSync} from 'node:fs';

const tenant='00000000-0000-4000-8000-000000000001';
const run='00000000-0000-4000-8000-000000000002';
const group='00000000-0000-4000-8000-000000000003';

test('ANY and ALL orchestration decisions have deterministic fail-closed rules',()=>{
 assert.equal(resolveFlowApprovalOutcome('ANY',['Pending','Approved']),'Approved');
 assert.equal(resolveFlowApprovalOutcome('ANY',['Rejected','Pending']),null);
 assert.equal(resolveFlowApprovalOutcome('ANY',['Rejected','Rejected']),'Rejected');
 assert.equal(resolveFlowApprovalOutcome('ALL',['Approved','Pending']),null);
 assert.equal(resolveFlowApprovalOutcome('ALL',['Approved','Approved']),'Approved');
 assert.equal(resolveFlowApprovalOutcome('ALL',['Approved','Rejected']),'Rejected');
 assert.throws(()=>resolveFlowApprovalOutcome('ANY',[]),/no approval requests/);
 assert.throws(()=>resolveFlowApprovalOutcome('ANY',['Unknown']),/Invalid/);
});

function stageClient(options:{rule?:'ANY'|'ALL';decisions?:string[];
 stageStatus?:string;activeRun?:boolean}={}){
 const statements:Array<{sql:string;params:unknown[]}>=[],rule=options.rule??'ANY';
 const client={query:async(sql:string,params:unknown[])=>{
  statements.push({sql,params});
  assert.equal(params[0],tenant,'Every orchestration SQL operation must scope tenant');
  if(sql.includes('SELECT group_id,run_id'))return {rows:[{
   group_id:group,run_id:run,element_id:2,rule,status:options.stageStatus??'waiting'}]};
  if(sql.includes('SELECT status FROM md_approval_requests'))return {rows:
   (options.decisions??['Approved','Pending']).map(status=>({status}))};
  if(sql.includes('SELECT r.started_by AS actor_id'))return {rows:options.activeRun===false?[]:[{
   actor_id:'00000000-0000-4000-8000-000000000004',flow_api:'ReviewFlow',
   version:3,app_api_name:null
  }]};
  return {rows:[],rowCount:1};
 }} as unknown as PoolClient;
 return {client,statements};
}

test('terminal approval marks one stage, cancels outstanding requests and signals one resume',async()=>{
 const {client,statements}=stageClient();
 const result=await finishFlowOrchestrationDecision(client,tenant,group);
 assert.deepEqual(result,{tenantId:tenant,runId:run,actorUserId:
  '00000000-0000-4000-8000-000000000004',version:3,appApiName:null});
 assert.ok(statements.some(item=>item.sql.includes("SET status='Canceled'")));
 assert.ok(statements.some(item=>item.sql.includes('SET wait_until=now()')));
 assert.ok(statements.every(item=>item.params[0]===tenant));
});
test('partial approval does not resume the Flow',async()=>{
 const {client,statements}=stageClient({rule:'ALL',decisions:['Approved','Pending']});
 assert.equal(await finishFlowOrchestrationDecision(client,tenant,group),null);
 assert.equal(statements.filter(item=>item.sql.trim().startsWith('UPDATE')).length,0);
});
test('orphaned orchestration stage cancels pending requests without scheduling a job',async()=>{
 const {client,statements}=stageClient({activeRun:false});
 assert.equal(await finishFlowOrchestrationDecision(client,tenant,group),null);
 assert.ok(statements.some(item=>item.sql.includes("status='cancelled'")));
 assert.ok(!statements.some(item=>item.sql.includes('SET wait_until=now()')));
});
test('completed stages never resubmit or enqueue new work',async()=>{
 const {client,statements}=stageClient({stageStatus:'Approved'});
 assert.equal(await finishFlowOrchestrationDecision(client,tenant,group),null);
 assert.equal(statements.length,1);
});
test('Flow orchestration uses additive relational SQL metadata with no JSON state column',()=>{
 const migration=readFileSync(new URL('../../src/system-support/migrations/20261116-flow-orchestration.sql',
  import.meta.url),'utf8');
 assert.match(migration,/CREATE TABLE IF NOT EXISTS md_flow_approval_stages/);
 assert.match(migration,/ON CONFLICT\(element_type,flow_type\) DO NOTHING/);
 assert.match(migration,/registry_version=1/);
 assert.doesNotMatch(migration,/jsonb|DROP TABLE|DELETE FROM md_flow/i);
});
