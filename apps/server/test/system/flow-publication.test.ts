import assert from 'node:assert/strict';
import {test} from 'node:test';
import {publishSimpleFlow} from '../../src/system-files/flow-publisher.js';
import type {PoolClient} from 'pg';

function client(){
 const queries:{sql:string;args:unknown[]}[]=[];
 const db={query:async(sql:string,args:unknown[]=[] )=>{
  queries.push({sql,args});
  if(sql.includes('SELECT version FROM md_flow_definitions'))return {rows:[]};
  if(sql.includes('INSERT INTO md_flow_definitions'))return {rows:[{id:'flow-id'}]};
  if(sql.includes('FROM md_permission_sets'))return {rows:[{id:'dev-permissions'}]};
  return {rows:[],rowCount:1};
 }};
 return {db:db as unknown as PoolClient,queries};
}
const flow=(elements:Array<{id:number;type:string}>,connectors:Array<{from:number;to:number;kind:string}>)=>({
 apiName:'Checkout',label:'Checkout',flowType:'Screen Flow',
 elements:elements.map(e=>({...e,label:e.type,config:{}})),connectors,resources:[]});
test('publishes a deterministic Screen Flow into relational nodes and edges',async()=>{
 const {db,queries}=client();
 const result=await publishSimpleFlow(db,'tenant','Checkout',flow(
  [{id:1,type:'Start'},{id:2,type:'Screen'},{id:3,type:'End'}],
  [{from:1,to:2,kind:'normal'},{from:2,to:3,kind:'normal'}]));
 assert.equal(result.versionNumber,1);
 assert.equal(result.status,'Active');
 assert.equal(queries.filter(q=>q.sql.includes('INSERT INTO md_flow_nodes')).length,3);
 assert.equal(queries.filter(q=>q.sql.includes('INSERT INTO md_flow_edges')).length,2);
 assert.ok(queries.some(q=>q.args.includes('Flow:Checkout')&&q.args.includes('execute')));
});
test('rejects cycles, disconnected, unsupported and branching graphs',async()=>{
 const invalid=[
  flow([{id:1,type:'Start'},{id:2,type:'Screen'},{id:3,type:'End'}],
   [{from:1,to:2,kind:'normal'},{from:2,to:1,kind:'normal'}]),
  flow([{id:1,type:'Start'},{id:2,type:'Screen'},{id:3,type:'End'}],
   [{from:1,to:2,kind:'normal'},{from:1,to:3,kind:'normal'},{from:2,to:3,kind:'normal'}]),
  flow([{id:1,type:'Start'},{id:2,type:'CreateRecord'},{id:3,type:'End'}],
   [{from:1,to:2,kind:'normal'},{from:2,to:3,kind:'normal'}])
 ];
 for(const bad of invalid){
  const {db,queries}=client();
  await assert.rejects(()=>publishSimpleFlow(db,'tenant','Checkout',bad));
  assert.equal(queries.some(q=>q.sql.includes('INSERT INTO md_flow_definitions')),false);
 }
});
