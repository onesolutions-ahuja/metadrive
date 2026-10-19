import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {FlowRecordQuery} from '../../src/system-files/flow-record-query.js';

test('Flow record query compiles custom logic into scoped SQL and returns complete records', async () => {
  const statements:Array<{sql:string;params:readonly unknown[]}>=[];
  const db={query:async(sql:string,params:readonly unknown[]=[]):Promise<{rows:unknown[]}>=>{
    statements.push({sql,params});
    if(sql.includes('FROM md_field_definitions'))return {rows:[
      {api_name:'Name',data_type:'text'},
      {api_name:'AnnualRevenue',data_type:'currency'}
    ]};
    return {rows:[
      {id:'record-1',created_at:new Date(0),updated_at:new Date(0),owner_id:'owner-1',
        record_type_id:null,field_api:'Name',value_text:'Northwind',reference_record_id:null,data_type:'text'},
      {id:'record-1',created_at:new Date(0),updated_at:new Date(0),owner_id:'owner-1',
        record_type_id:null,field_api:'AnnualRevenue',value_text:'25.50',reference_record_id:null,data_type:'currency'}
    ]};
  }} as unknown as SqlPersistence;
  const rbac={require:async()=>undefined,allowed:async()=>true,
    allowedMany:async(_tenant:string,_user:string,resources:unknown[])=>resources.map(()=>true)} as unknown as RbacEngine;
  const query=new FlowRecordQuery(db,rbac);
  const records=await query.find('tenant-1','user-1','Account',[
    {field:'Name',operator:'Contains',value:'north'},
    {field:'AnnualRevenue',operator:'Greater Than',value:20},
    {field:'Name',operator:'Starts With',value:'north'}
  ],'1 AND (2 OR 3)',{sortField:'AnnualRevenue',sortOrder:'Descending',limit:1});
  assert.equal(records.length,1);
  assert.equal(records[0].Name,'Northwind');
  assert.equal(records[0].AnnualRevenue,25.5);
  const statement=statements[1];
  assert.match(statement.sql,/md_record_access\(\$1,\$3,r\.id,'read'\)/);
  assert.match(statement.sql,/strpos\(lower/);
  assert.match(statement.sql,/::numeric/);
  assert.match(statement.sql,/1 AND|AND/);
  assert.match(statement.sql,/WITH matching AS/);
  assert.deepEqual(statement.params.slice(0,3),['tenant-1','Account','user-1']);
  assert.equal(statement.params.at(-1),1);
});

test('Flow record query rejects unsafe filters and invalid custom condition logic', async () => {
  let fieldReads=0;
  const db={query:async(sql:string)=>{
    if(sql.includes('FROM md_field_definitions')){
      fieldReads++;
      return {rows:[{api_name:'Name',data_type:'text'}]};
    }
    return {rows:[]};
  }} as unknown as SqlPersistence;
  const rbac={require:async()=>undefined,allowed:async()=>true,
    allowedMany:async(_tenant:string,_user:string,resources:unknown[])=>resources.map(()=>true)} as unknown as RbacEngine;
  const query=new FlowRecordQuery(db,rbac);
  await assert.rejects(()=>query.find('tenant','user','Account',
    [{field:'Name; DROP TABLE md_records',operator:'Equals',value:'x'}]),/filter field/);
  await assert.rejects(()=>query.find('tenant','user','Account',
    [{field:'Name',operator:'Equals',value:'x'}],'1 OR ('),/Invalid Flow filter logic/);
  assert.equal(fieldReads,2);
});
