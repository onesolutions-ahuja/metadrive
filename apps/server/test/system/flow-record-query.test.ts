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
  assert.equal(records[0].CreatedAt,'1970-01-01T00:00:00.000Z');
  assert.equal(records[0].LastModifiedDate,'1970-01-01T00:00:00.000Z');
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


test('Flow Get Records projects typed boolean and numeric values used by POS payment validation',async()=>{
 const statements:string[]=[];
 const db={query:async(sql:string)=>{
  statements.push(sql);
  if(sql.includes('FROM md_field_definitions'))return {rows:[
   {api_name:'Active',data_type:'boolean'},{api_name:'Price',data_type:'number'}]};
  return {rows:[
   {id:'product-1',created_at:new Date(0),updated_at:new Date(0),owner_id:null,
    record_type_id:null,field_api:'Active',value_text:null,value_number:null,
    value_boolean:true,reference_record_id:null,data_type:'boolean'},
   {id:'product-1',created_at:new Date(0),updated_at:new Date(0),owner_id:null,
    record_type_id:null,field_api:'Price',value_text:null,value_number:'4.25',
    value_boolean:null,reference_record_id:null,data_type:'number'}
  ]};
 }} as unknown as SqlPersistence;
 const rbac={require:async()=>undefined,allowed:async()=>true,
  allowedMany:async(_tenant:string,_user:string,resources:unknown[])=>resources.map(()=>true)} as unknown as RbacEngine;
 const rows=await new FlowRecordQuery(db,rbac).find('tenant','user','Product',[
  {field:'Active',operator:'Equals',value:true}
 ]);
 assert.equal(rows.length,1);
 assert.equal(rows[0].Active,true);
 assert.equal(rows[0].Price,4.25);
 assert.match(statements[1],/v\.value_boolean::text/);
 assert.match(statements[1],/v\.value_number/);
 assert.match(statements[1],/::text/);
});

test('Flow Get Records supports current-user OwnerId filters without granting wider record access',async()=>{
 const statements:Array<{sql:string;params:readonly unknown[]}>=[];
 const db={query:async(sql:string,params:readonly unknown[]=[]):Promise<{rows:unknown[]}>=>{
  statements.push({sql,params});
  if(sql.includes('FROM md_field_definitions'))return {rows:[{api_name:'Name',data_type:'text'}]};
  return {rows:[{id:'contact-1',created_at:new Date(0),updated_at:new Date(0),
   owner_id:'user-1',record_type_id:null,field_api:'Name',value_text:'Assigned Contact',
   reference_record_id:null,value_number:null,value_boolean:null,value_date:null,
   value_datetime:null,data_type:'text'}]};
 }} as unknown as SqlPersistence;
 const rbac={require:async()=>undefined,allowed:async()=>true,
  allowedMany:async(_tenant:string,_user:string,resources:unknown[])=>resources.map(()=>true)} as unknown as RbacEngine;
 const rows=await new FlowRecordQuery(db,rbac).find('tenant-1','user-1','Contact',[
  {field:'OwnerId',operator:'Equals',value:'user-1'},
  {field:'Name',operator:'Contains',value:'assigned'}
 ],'All',{sortField:'Name',sortOrder:'Ascending',limit:200});
 assert.equal(rows.length,1);
 assert.equal(rows[0].OwnerId,'user-1');
 assert.equal(rows[0].Name,'Assigned Contact');
 assert.ok(statements[1].sql.includes('COALESCE(r.owner_id,r.owner_queue_id)::text'));
 assert.deepEqual(statements[1].params.slice(0,6),
  ['tenant-1','Contact','user-1','user-1','Name','assigned']);
 assert.ok(statements[1].sql.includes("md_record_access($1,$3,r.id,'read')"));
});


test('Flow record query sorts by shared CreatedAt and LastModifiedDate fields without custom field metadata',async()=>{
 const statements:string[]=[];
 const db={query:async(sql:string)=>{
  statements.push(sql);
  if(sql.includes('FROM md_field_definitions'))return {rows:[]};
  return {rows:[]};
 }} as unknown as SqlPersistence;
 const rbac={require:async()=>undefined,allowed:async()=>true,
  allowedMany:async(_tenant:string,_user:string,resources:unknown[])=>resources.map(()=>true)} as unknown as RbacEngine;
 const query=new FlowRecordQuery(db,rbac);
 await query.find('tenant','user','Communication',[],undefined,
  {sortField:'CreatedAt',sortOrder:'Descending',limit:200});
 await query.find('tenant','user','Communication',[],undefined,
  {sortField:'LastModifiedDate',sortOrder:'Descending',limit:200});
 const dataQueries=statements.filter(sql=>sql.includes('WITH matching AS'));
 assert.equal(dataQueries.length,2);
 assert.match(dataQueries[0],/ORDER BY r\.created_at DESC,r\.id ASC LIMIT/);
 assert.match(dataQueries[1],/ORDER BY r\.updated_at DESC,r\.id ASC LIMIT/);
});
