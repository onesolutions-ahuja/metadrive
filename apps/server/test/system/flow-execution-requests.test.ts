import test from 'node:test';
import assert from 'node:assert/strict';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {PoolClient} from 'pg';
import {FlowExecutionRequests} from '../../src/system-files/flow-execution-requests.js';

const tenant='00000000-0000-4000-8000-000000000001';
const actor='00000000-0000-4000-8000-000000000002';
const requestId='00000000-0000-4000-8000-000000000003';
function fixture(){
 const state={hash:'',status:'pending',runId:null as string|null,
   responseRows:[] as Array<{property_path:string;value_kind:string;value_text:string|null}>};
 const queries:Array<{sql:string;args:unknown[]}>=[];let claimed=false;
 const query=async(sql:string,args:unknown[]=[])=>{
   queries.push({sql,args});
   if(sql.includes('INSERT INTO md_flow_execution_requests')){
     if(claimed)return {rowCount:0,rows:[]};
     claimed=true;state.hash=String(args[4]);return {rowCount:1,rows:[{request_id:requestId}]};
   }
   if(sql.includes('SELECT input_hash,state'))return {rowCount:1,rows:[{
     input_hash:state.hash,state:state.status,run_id:state.runId
   }]};
   if(sql.includes('SELECT state FROM md_flow_execution_requests'))
     return {rowCount:1,rows:[{state:state.status}]};
   if(sql.includes('SELECT property_path,value_kind,value_text FROM md_flow_execution_result_values'))
     return {rowCount:state.responseRows.length,rows:state.responseRows};
   if(sql.includes('INSERT INTO md_flow_execution_result_values')){
     state.responseRows.push({property_path:String(args[4]),value_kind:String(args[5]),
       value_text:args[6]===null?null:String(args[6])});
     return {rowCount:1,rows:[]};
   }
   if(sql.includes('SET run_id=')){state.runId=String(args[4]);return {rowCount:1,rows:[]};}
   if(sql.includes("SET state='completed'")){
     if(state.status!=='pending')return {rowCount:0,rows:[]};
     state.status='completed';return {rowCount:1,rows:[{request_id:requestId}]};
   }
   if(sql.includes("SET state='failed'")){state.status='failed';return {rowCount:1,rows:[]};}
   throw Error('Unexpected SQL '+sql);
 };
 const db={query,transaction:async(run:(client:{query:typeof query})=>Promise<unknown>)=>run({query})} as unknown as SqlPersistence;
 return {client:new FlowExecutionRequests(db),state,queries};
}

test('Flow requests are tenant and actor scoped and replay the completed response',async()=>{
 const f=fixture(),input={requestId,ProductId:'p-1'};
 assert.deepEqual(await f.client.claim(tenant,actor,'Checkout',requestId,input),{owner:true});
 await f.client.started(tenant,actor,'Checkout',requestId,requestId);
 const output={id:requestId,status:'completed',completed:true,outputs:{requestId}};
 await f.client.completed(tenant,actor,'Checkout',requestId,output);
 assert.deepEqual(await f.client.claim(tenant,actor,'Checkout',requestId,input),{owner:false,value:output});
 assert.ok(f.queries.every(query=>query.args[0]===tenant && query.args[1]===actor));
 assert.ok(f.state.responseRows.length>0,'Replay must be stored in typed SQL value rows');
 assert.ok(f.queries.every(query=>!query.sql.includes('::jsonb')));
});
test('Reusing a requestId with changed inputs fails, even if previously completed',async()=>{
 const f=fixture(),input={requestId,Qty:1};
 await f.client.claim(tenant,actor,'Order',requestId,input);
 await assert.rejects(()=>f.client.claim(tenant,actor,'Order',requestId,
   {requestId,Qty:2}),/different inputs/);
});
test('In-flight request cannot start a second Flow and failed request cannot be replayed',async()=>{
 const f=fixture(),input={requestId,Qty:1};
 await f.client.claim(tenant,actor,'Order',requestId,input);
 assert.deepEqual(await f.client.claim(tenant,actor,'Order',requestId,input),{
   owner:false,value:{id:'',status:'pending',completed:false}
 });
 await f.client.failed(tenant,actor,'Order',requestId);
 await assert.rejects(()=>f.client.claim(tenant,actor,'Order',requestId,input),/previous Flow request failed/i);
});
test('Nested Flow outputs replay without JSONB, preserving arrays and numeric types',async()=>{
 const f=fixture(),input={requestId,Cart:[{ProductId:'P1'}]};
 await f.client.claim(tenant,actor,'BuildMeal',requestId,input);
 const result={id:requestId,status:'completed',completed:true,
   outputs:{lines:[{name:'Chicken',quantity:2,priceMinor:850}],totalMinor:850,selected:true}};
 await f.client.completed(tenant,actor,'BuildMeal',requestId,result);
 assert.deepEqual((await f.client.claim(tenant,actor,'BuildMeal',requestId,input)),
   {owner:false,value:result});
 assert.ok(f.state.responseRows.some(row=>row.property_path==='/result/outputs/lines/0/name'));
 assert.equal(f.state.responseRows.find(row=>row.property_path==='/result/outputs/totalMinor')?.value_kind,
   'number');
});
test('Identical completed Flow response is idempotent but conflicting replay is denied',async()=>{
 const f=fixture(),input={requestId,Quantity:2};
 await f.client.claim(tenant,actor,'Checkout',requestId,input);
 const result={id:requestId,status:'completed',completed:true,outputs:{Quantity:2}};
 await f.client.completed(tenant,actor,'Checkout',requestId,result);
 const before=f.state.responseRows.length;
 await assert.doesNotReject(()=>f.client.completed(tenant,actor,'Checkout',requestId,result));
 assert.equal(f.state.responseRows.length,before,'duplicate completion must not duplicate values');
 await assert.rejects(()=>f.client.completed(tenant,actor,'Checkout',requestId,
   {...result,outputs:{Quantity:3}}),/Conflicting completed Flow response/);
});
test('Paused Screen Flow writes completed replay atomically to the relational ledger',async()=>{
 const seen:Array<{sql:string;args:unknown[]}>=[];
 const client={query:async(sql:string,args:unknown[]=[])=>{
   seen.push({sql,args});
   if(sql.includes('UPDATE md_flow_execution_requests'))
     return {rowCount:1,rows:[{actor_id:actor,flow_api:'Checkout',request_id:requestId}]};
   if(sql.includes('INSERT INTO md_flow_execution_result_values'))
     return {rowCount:1,rows:[]};
   throw Error('Unexpected SQL '+sql);
 }} as unknown as PoolClient;
 await FlowExecutionRequests.completeRun(client,tenant,requestId,
   {id:requestId,status:'completed',completed:true,outputs:{totalMinor:1399}});
 assert.ok(seen[0].sql.includes("state='completed'"));
 assert.ok(seen.some(row=>row.sql.includes('INSERT INTO md_flow_execution_result_values')
   &&row.args[0]===tenant&&row.args[1]===actor&&row.args[2]==='Checkout'
   &&row.args[4]==='/result/outputs/totalMinor'&&row.args[5]==='number'));
 assert.ok(seen.every(row=>!row.sql.includes('result_payload')));
});
test('Only UUID request IDs activate the ledger',()=>{
 assert.equal(FlowExecutionRequests.key({} as Record<string,unknown>),null);
 assert.equal(FlowExecutionRequests.key({requestId}),requestId);
 assert.throws(()=>FlowExecutionRequests.key({requestId:'checkout-1'}),/UUID/);
});
