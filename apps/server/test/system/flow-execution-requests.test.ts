import test from 'node:test';
import assert from 'node:assert/strict';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {FlowExecutionRequests} from '../../src/system-files/flow-execution-requests.js';

const tenant='00000000-0000-4000-8000-000000000001';
const actor='00000000-0000-4000-8000-000000000002';
const requestId='00000000-0000-4000-8000-000000000003';
function fixture(){
 const state={hash:'',status:'pending',runId:null as string|null,response:null as unknown};
 const queries:Array<{sql:string;args:unknown[]}>=[];let claimed=false;
 const db={query:async(sql:string,args:unknown[]=[])=>{
   queries.push({sql,args});
   if(sql.includes('INSERT INTO md_flow_execution_requests')){
     if(claimed)return {rowCount:0,rows:[]};
     claimed=true;state.hash=String(args[4]);return {rowCount:1,rows:[{request_id:requestId}]};
   }
   if(sql.includes('SELECT input_hash,state'))return {rowCount:1,rows:[{
     input_hash:state.hash,state:state.status,result_payload:state.response,run_id:state.runId
   }]};
   if(sql.includes('SET run_id=')){state.runId=String(args[4]);return {rowCount:1,rows:[]};}
   if(sql.includes("SET state='completed'")){state.status='completed';state.response=JSON.parse(String(args[4]));return {rowCount:1,rows:[]};}
   if(sql.includes("SET state='failed'")){state.status='failed';return {rowCount:1,rows:[]};}
   throw Error('Unexpected SQL '+sql);
 }} as unknown as SqlPersistence;
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
test('Only UUID request IDs activate the ledger',()=>{
 assert.equal(FlowExecutionRequests.key({} as Record<string,unknown>),null);
 assert.equal(FlowExecutionRequests.key({requestId}),requestId);
 assert.throws(()=>FlowExecutionRequests.key({requestId:'checkout-1'}),/UUID/);
});
