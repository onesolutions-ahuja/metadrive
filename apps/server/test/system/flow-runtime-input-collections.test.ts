import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {encodeMetadataValue} from '../../src/system-files/component-runtime.js';
import {FlowRuntime} from '../../src/system-files/flow-runtime.js';

const runId='00000000-0000-4000-8000-000000000011';
const flowId='00000000-0000-4000-8000-000000000012';

function makeRuntime(availableForInput=true) {
  const metadata:Array<{path:string;kind:string;text:string|null}>=[];
  encodeMetadataValue({builder:{resources:[{
    name:'CartLines',label:'Cart Lines',type:'Record Collection',dataType:'InvoiceLine',
    isCollection:true,availableForInput,availableForOutput:false
  }],elements:[{id:1,type:'Start',config:{}}]}},'',metadata);
  const statements:Array<{sql:string;values?:unknown[]}>=[];
  const client={query:async(sql:string,values?:unknown[])=>{
    statements.push({sql,values});
    if(sql.includes('INSERT INTO md_flow_runs'))
      return {rows:[{id:runId}],rowCount:1};
    return {rows:[],rowCount:1};
  }};
  const db={
    query:async(sql:string)=>{
      if(sql.includes('SELECT id,version,system_context_approved_by FROM md_flow_definitions'))
        return {rows:[{id:flowId,version:1,system_context_approved_by:null}],rowCount:1};
      if(sql.includes('FROM md_flow_editor_values'))
        return {rows:metadata.map(row=>({
          property_path:row.path,value_kind:row.kind,value_text:row.text
        })),rowCount:metadata.length};
      if(sql.includes('FROM md_object_definitions'))
        return {rows:[{exists:1}],rowCount:1};
      throw new Error('Unexpected Flow input query: '+sql);
    },
    transaction:async<T>(operation:(transaction:typeof client)=>Promise<T>)=>operation(client)
  } as unknown as SqlPersistence;
  const rbac={require:async()=>undefined} as unknown as RbacEngine;
  return {runtime:new FlowRuntime(db,rbac),statements};
}

test('Flow start stores bounded typed Record Collection inputs in relational interview tables',async()=>{
  const {runtime,statements}=makeRuntime();
  const result=await runtime.start('tenant','Checkout','user',{
    CartLines:[
      {ProductId:'00000000-0000-4000-8000-000000000021',Quantity:2,UnitPrice:1.25},
      {ProductId:'00000000-0000-4000-8000-000000000022',Quantity:1,UnitPrice:2.5}
    ],
    RequestId:'checkout-1'
  });

  assert.equal(result,runId);
  assert.deepEqual(statements.find(item=>item.sql.includes('INSERT INTO md_flow_interview_state'))?.values,
    ['tenant',runId,1]);
  const records=statements.filter(item=>item.sql.includes('INSERT INTO md_flow_interview_records'));
  assert.deepEqual(records.map(item=>item.values),[
    ['tenant',runId,'CartLines','InvoiceLine',0],
    ['tenant',runId,'CartLines','InvoiceLine',1]
  ]);
  const fields=statements.filter(item=>item.sql.includes('INSERT INTO md_flow_interview_record_fields'));
  assert.deepEqual(fields.map(item=>item.values),[
    ['tenant',runId,'CartLines',0,'ProductId','00000000-0000-4000-8000-000000000021','string'],
    ['tenant',runId,'CartLines',0,'Quantity','2','number'],
    ['tenant',runId,'CartLines',0,'UnitPrice','1.25','number'],
    ['tenant',runId,'CartLines',1,'ProductId','00000000-0000-4000-8000-000000000022','string'],
    ['tenant',runId,'CartLines',1,'Quantity','1','number'],
    ['tenant',runId,'CartLines',1,'UnitPrice','2.5','number']
  ]);
  assert.deepEqual(statements.find(item=>item.sql.includes('INSERT INTO md_flow_run_inputs'))?.values,
    ['tenant',runId,'RequestId','checkout-1','string']);
});

test('Flow start rejects arrays that are not declared input Record Collections',async()=>{
  const {runtime,statements}=makeRuntime(false);
  await assert.rejects(
    ()=>runtime.start('tenant','Checkout','user',{CartLines:[{Quantity:1}]}),
    /not a declared Record Collection/
  );
  assert.equal(statements.length,0);
});

test('Flow start enforces the Record Collection item limit',async()=>{
  const {runtime,statements}=makeRuntime();
  await assert.rejects(
    ()=>runtime.start('tenant','Checkout','user',{
      CartLines:Array.from({length:201},()=>({Quantity:1}))
    }),
    /200-record limit/
  );
  assert.equal(statements.length,0);
});

test('Flow start preserves an empty Record Collection as empty',async()=>{
  const {runtime,statements}=makeRuntime();
  await runtime.start('tenant','Checkout','user',{CartLines:[]});

  assert.deepEqual(statements.find(item=>item.sql.includes('INSERT INTO md_flow_interview_records'))?.values,
    ['tenant',runId,'CartLines','InvoiceLine',0]);
  assert.equal(statements.filter(item=>item.sql.includes('INSERT INTO md_flow_interview_record_fields')).length,0);
});
