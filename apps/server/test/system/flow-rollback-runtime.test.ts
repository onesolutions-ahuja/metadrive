import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {RecordEngine} from '../../src/system-files/record-engine.js';
import {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import {encodeMetadataValue} from '../../src/system-files/component-runtime.js';

test('Roll Back Records rolls back the Flow savepoint and continues its path',async()=>{
 const graph={
  flowType:'Autolaunched Flow',resources:[{
   name:'result',type:'Variable',dataType:'Text',availableForOutput:true
  }],
  elements:[
   {id:1,type:'Start',label:'Start',config:{}},
   {id:2,type:'Assignment',label:'Set value',config:{variable:'result',value:'retained'}},
   {id:3,type:'Roll Back Records',label:'Undo changes',config:{}},
   {id:4,type:'End',label:'End',config:{}}
  ],
  connectors:[
   {from:1,to:2,label:'Default',kind:'normal'},
   {from:2,to:3,label:'Default',kind:'normal'},
   {from:3,to:4,label:'Default',kind:'normal'}
  ]
 };
 const metadata:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graph,'/builder',metadata);
 const transactionSql:string[]=[];
 const client={query:async(sql:string)=>{
  if(sql.includes('SELECT r.flow_id,f.api_name,f.flow_type,f.version,r.started_by,r.initiated_by'))
   return {rows:[{flow_id:'flow-id',api_name:'RollbackFlow',flow_type:'Autolaunched Flow',
    version:1,started_by:'user-id',initiated_by:'user-id',execution_context:'User',
    system_context_approved_by:null,status:'pending'}]};
  if(sql.includes('FROM md_flow_editor_values'))return {rows:metadata.map(row=>({
   property_path:row.path,value_kind:row.kind,value_text:row.text
  }))};
  if(sql.includes('SELECT current_element,history_elements,step_count'))return {rows:[]};
  if(sql.includes('INSERT INTO md_flow_interview_state'))return {rows:[],rowCount:1};
  if(sql.includes('FROM md_flow_interview_loop_state')
   ||sql.includes('FROM md_flow_run_inputs')
   ||sql.includes('FROM md_flow_interview_values')
   ||sql.includes('FROM md_flow_interview_records')
   ||sql.includes('FROM md_flow_interview_record_fields'))return {rows:[]};
  if(sql.includes('SAVEPOINT')||sql.includes('ROLLBACK TO SAVEPOINT')){
   transactionSql.push(sql);return {rows:[]};
  }
  if(sql.includes("UPDATE md_flow_runs SET status='completed'"))return {rows:[],rowCount:1};
  throw new Error('Unexpected Flow rollback query: '+sql);
 }};
 const db={query:client.query} as unknown as SqlPersistence;
 const runtime=new FlowRuntime(db,{require:async()=>undefined} as unknown as RbacEngine,
  {} as RecordEngine);
 const result=await runtime.advanceInterview('tenant','user-id',
  '00000000-0000-4000-8000-000000000001',{},client as never);
 assert.equal(result.status,'completed');
 assert.equal((result as {outputs:Record<string,unknown>}).outputs.result,'retained');
 assert.deepEqual(transactionSql.map(sql=>sql.split(' ')[0]),
  ['SAVEPOINT','ROLLBACK','RELEASE','SAVEPOINT']);
});
