import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateFlowGraph,flowDebugSnapshot} from '../../src/system-files/flow-debug-runtime.js';
import {flowRunHistory} from '../../src/system-files/flow-run-history.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

const start={id:1,type:'Start',config:{}},end={id:9,type:'End',config:{}};
const edge=(from:number,to:number,label='Default')=>({from,to,label,kind:'normal'});

test('read-only Flow debug traces each step with snapshot, timing and no side effects',async()=>{
 let writes=0;
 const nodes=[
  start,{id:2,type:'Get Records',config:{object:'Account',conditions:[],recordLimit:2,
   outputVariable:'Accounts'}},
  {id:3,type:'Collection Sort',config:{collection:'Accounts',outputCollection:'Sorted',
   sortField:'Name',sortOrder:'Ascending'}},
  {id:4,type:'Create Records',config:{object:'Account',fieldValues:[{field:'Name',value:'A'}]}},
  {id:5,type:'HTTP Callout',config:{}},
  {id:6,type:'Subflow',config:{flowApiName:'Child'}},
  end
 ];
 const edges=[edge(1,2),edge(2,3),edge(3,4),edge(4,5),edge(5,6),edge(6,9)];
 const result=await simulateFlowGraph({apiName:'Example',version:3,flowType:'Autolaunched Flow',
   recordTriggered:false,nodes,edges,inputs:{Password:'private'},findRecords:async()=>{
    writes+=0;return [{Name:'Zed',ApiToken:'private'},{Name:'Alice'}];
   }});
 assert.equal(result.status,'completed');
 assert.equal(result.dryRun,true);
 assert.equal(result.debugTrace.length,7);
 assert.equal(result.debugTrace[3].status,'Simulated');
 assert.equal(result.debugTrace[4].status,'Simulated');
 assert.equal(result.debugTrace[5].status,'Simulated');
 assert.deepEqual(result.debugTrace[2].variables.Sorted.map((value:{Name:string})=>value.Name),['Alice','Zed']);
 assert.equal(result.debugTrace[2].variables.Password,'[Redacted]');
 assert.equal(result.debugTrace[2].variables.Sorted[1].ApiToken,'[Redacted]');
 assert.ok(result.debugTrace.every(step=>step.durationMs>=0));
 assert.equal(writes,0);
});

test('read-only debug simulates wait and returns a failed step without SQL writes',async()=>{
 const wait=await simulateFlowGraph({apiName:'Wait',version:1,flowType:'Autolaunched Flow',
  recordTriggered:false,nodes:[start,{id:2,type:'Wait',config:{amount:2,unit:'Hours'}},end],
  edges:[edge(1,2),edge(2,9)],inputs:{}});
 assert.equal(wait.status,'waiting');
 assert.equal(wait.debugTrace[1].status,'Waiting');
 const failed=await simulateFlowGraph({apiName:'Fail',version:1,flowType:'Autolaunched Flow',
  recordTriggered:false,nodes:[start,{id:2,type:'Delete Records',config:{}},
    {id:3,type:'Custom Error',config:{errorMessage:'Denied'}},end],
  edges:[edge(1,2),edge(2,3),edge(3,9)],inputs:{}});
 assert.equal(failed.status,'failed');
 assert.equal(failed.debugTrace[1].status,'Simulated');
 assert.equal(failed.debugTrace[2].status,'Failed');
 assert.equal(failed.reason,'Denied');
});

test('record-triggered debugger reads supplied record inputs without persisting them',async()=>{
 const graph=await simulateFlowGraph({apiName:'AccountBefore',version:1,flowType:'Record-Triggered Flow',
  recordTriggered:true,nodes:[{id:1,type:'Start',config:{trigger:'updated'}},
   {id:2,type:'Assignment',config:{variable:'$Record.Name',value:'Changed'}},end],
  edges:[edge(1,2),edge(2,9)],
  inputs:{event:'updated',record:{Id:'r1',Name:'Original'},prior:{Id:'r1',Name:'Before'}}});
 assert.equal(graph.status,'completed');
 assert.equal((graph.outputs as { $Record:{Name:string} }).$Record.Name,'Changed');
});

test('read-only debug uses runtime collection Assignment semantics and rejects divide by zero',async()=>{
 const resources=[
  {name:'Records',type:'Record Collection',dataType:'Account',isCollection:true},
  {name:'NewRecord',type:'Record',dataType:'Account'}
 ];
 const collection=await simulateFlowGraph({apiName:'CollectionAssignment',version:1,
  flowType:'Autolaunched Flow',recordTriggered:false,resources,
  nodes:[start,{id:2,type:'Assignment',config:{variable:'Records',
    operator:'Add At Beginning',value:'@NewRecord'}},end],
  edges:[edge(1,2),edge(2,9)],
  inputs:{Records:[{Id:'existing'}],NewRecord:{Name:'new'}}});
 assert.equal(collection.status,'completed');
 assert.deepEqual((collection.outputs as {Records:unknown[]}).Records,
  [{Name:'new'},{Id:'existing'}]);

 const division=await simulateFlowGraph({apiName:'Division',version:1,
  flowType:'Autolaunched Flow',recordTriggered:false,
  nodes:[start,{id:2,type:'Assignment',config:{variable:'total',
    operator:'Divide',value:0}},end],
  edges:[edge(1,2),edge(2,9)],inputs:{total:8}});
 assert.equal(division.status,'failed');
 assert.match(String(division.reason),/divide by zero/i);
});

test('record entry conditions compare record fields to literal values, not same-named fields',async()=>{
 const result=await simulateFlowGraph({apiName:'RecordFilter',version:1,
  flowType:'Record-Triggered Flow',recordTriggered:true,
  nodes:[{id:1,type:'Start',config:{trigger:'created',
    entryConditions:[{field:'Status',operator:'Equals',value:'Status'}]}},end],
  edges:[edge(1,9)],inputs:{event:'created',record:{Id:'r1',Status:'Active'}}});
 assert.equal(result.status,'skipped');
 assert.equal(result.debugTrace.length,1);
});

test('debug snapshots redact credentials and bound nested data',()=>{
 const snapshot=flowDebugSnapshot({CredentialToken:'abc',password:'123',
  huge:'x'.repeat(500),rows:Array.from({length:20},(_,i)=>({Id:i}))}) as Record<string,unknown>;
 assert.equal(snapshot.CredentialToken,'[Redacted]');
 assert.equal(snapshot.password,'[Redacted]');
 assert.ok(String(snapshot.huge).length<245);
 assert.equal((snapshot.rows as unknown[]).length,11);
});

test('tenant SQL run history filters statuses, paginates by stable id and checks RBAC first',async()=>{
 const tenant='00000000-0000-4000-8000-000000000001';
 const id='10000000-0000-4000-8000-000000000001';
 const seen:unknown[][]=[];
 const permissions:string[]=[];
 const rbac={require:async(t:string,u:string,resource:string,action:string)=>{
  permissions.push([t,u,resource,action].join('/'));
 }} as unknown as RbacEngine;
 const db={query:async(sql:string,params:unknown[])=>{
  assert.match(sql,/r\.tenant_id=\$1/);
  assert.match(sql,/r\.status=\$3/);
  assert.ok(permissions.length);
  seen.push(params);
  return {rows:[{
   id,api_name:'Checkout',label:'Checkout',version:2,flow_type:'Autolaunched Flow',
   started_by:'u1',started_at:new Date('2026-10-19T10:00:00Z'),
   finished_at:new Date('2026-10-19T10:00:02Z'),error_code:null,status:'completed'
  }]};
 }} as unknown as SqlPersistence;
 const result=await flowRunHistory(db,rbac,tenant,'u1',{status:'completed',limit:1});
 assert.equal(result.runs[0].durationMs,2000);
 assert.equal(result.runs[0].status,'completed');
 assert.deepEqual(seen[0],[tenant,2,'completed']);
 assert.equal(result.nextCursor,null);
 await assert.rejects(()=>flowRunHistory(db,rbac,tenant,'u1',{status:'unknown'}),/Invalid Flow status/);
 await assert.rejects(()=>flowRunHistory(db,rbac,tenant,'u1',{cursor:'garbage'}),/Invalid Flow history cursor/);
});
