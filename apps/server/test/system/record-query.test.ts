import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileRecordFilters,parseFilterLogic,parseRecordCursor,parseRecordFilters} from '../../src/system-files/record-query.js';
import {RecordEngine} from '../../src/system-files/record-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

const fields=new Map([
  ['Amount',{api_name:'Amount',data_type:'currency'}],
  ['Name',{api_name:'Name',data_type:'text'}],
]);

test('filter logic parses precedence and parenthesized combinations',()=>{
  assert.equal(parseFilterLogic('1 AND (2 OR 3)',3),'(f0 AND ((f1 OR f2)))');
  assert.equal(parseFilterLogic(undefined,2),'f0 AND f1');
  assert.throws(()=>parseFilterLogic('1 OR 4',3),/Invalid record filter reference/);
  assert.throws(()=>parseFilterLogic('1 AND',2),/Invalid record filter reference/);
});

test('record filters parameterize fields, values, typed comparisons and escaped text',()=>{
  const result=compileRecordFilters([
    {field:'Amount',operator:'gte',value:'12.5'},
    {field:'Name',operator:'contains',value:'A%_B'},
  ],'1 AND 2',fields,4);
  assert.match(result.predicate,/value_number>=\$5::numeric/);
  assert.match(result.predicate,/lower\(fv\.value_text\) LIKE lower\(\$7\) ESCAPE/);
  assert.deepEqual(result.parameters,['Amount','12.5','Name','%A\\%\\_B%']);
});

test('record filters reject unknown fields, unsafe operators and oversized IN lists',()=>{
  assert.throws(()=>compileRecordFilters([
    {field:'Missing',operator:'eq',value:'x'},
  ],undefined,fields,4),/Invalid list field/);
  assert.throws(()=>compileRecordFilters([
    {field:'Name',operator:'in',value:[]},
  ],undefined,fields,4),/Invalid IN filter values/);
});

test('query inputs validate saved filter arrays and keyset cursors',()=>{
  assert.deepEqual(parseRecordFilters(JSON.stringify([
    {field:'Name',operator:'startsWith',value:'Ada'},
  ])),[{field:'Name',operator:'startsWith',value:'Ada'}]);
  assert.throws(()=>parseRecordFilters('{"field":"Name"}'),/Invalid record filters/);
  const encoded=Buffer.from(JSON.stringify({
    field:'Amount',direction:'desc',value:'12.50',id:'123e4567-e89b-42d3-a456-426614174000',
  })).toString('base64url');
  assert.deepEqual(parseRecordCursor(encoded),{
    field:'Amount',direction:'desc',value:'12.50',id:'123e4567-e89b-42d3-a456-426614174000',
  });
  assert.throws(()=>parseRecordCursor('not-a-cursor'),/Invalid record cursor/);
});

test('record search and saved view migration use weighted SQL indexes and relational state',()=>{
  const migration=readFileSync(new URL('../../src/system-support/migrations/20261115-list-views-record-search.sql',import.meta.url),'utf8');
  const query=readFileSync(new URL('../../src/system-files/record-engine.ts',import.meta.url),'utf8');
  for(const table of ['md_list_views','md_list_view_columns','md_list_view_filters',
    'md_list_view_filter_values','md_list_view_groups','md_list_view_pins',
    'md_search_layout_fields','md_search_layout_columns','md_record_search_values'])
    assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(migration,/search_vector tsvector NOT NULL/);
  assert.match(migration,/USING gin\(search_vector\)/);
  assert.match(migration,/md_record_policies_share_target/);
  assert.match(migration,/md_record_policies_restriction_subject/);
  assert.match(query,/setweight\(qv\.search_vector,qv\.weight\)/);
});

test('record pages emit and consume a deterministic sort keyset cursor',async()=>{
  const calls:Array<{sql:string;args:unknown[]}>= [];
  const ids=['123e4567-e89b-42d3-a456-426614174000','123e4567-e89b-42d3-a456-426614174001'];
  const db={query:async(sql:string,args:unknown[]=[])=>{
    calls.push({sql,args});
    if(sql.includes('SELECT api_name,data_type,related_object'))return {rows:[
      {api_name:'Name',data_type:'text',related_object:null,required:false,max_length:80,
        package_object_retained:false},
    ]};
    if(sql.includes('WITH authorized AS MATERIALIZED'))return {rows:[{
      id:ids[calls.filter(call=>call.sql.includes('WITH authorized AS MATERIALIZED')).length-1],
      created_at:new Date('2026-01-01T00:00:00.000Z'),updated_at:new Date('2026-01-01T00:00:00.000Z'),
      owner_id:null,record_type_id:null,is_clone:false,sort_value:'Ada',
      total_count:'2',
      field_api:null,value_text:null,reference_record_id:null,data_type:null,value_number:null,
      value_date:null,value_datetime:null,value_boolean:null,geo_latitude:null,geo_longitude:null,
      address_street:null,address_city:null,address_state:null,address_postal_code:null,address_country:null,
    }]};
    throw new Error(`Unexpected query: ${sql}`);
  }} as unknown as SqlPersistence;
  const rbac={require:async()=>undefined,allowed:async()=>true} as unknown as RbacEngine;
  const engine=new RecordEngine(db,rbac);
  const first=await engine.list('tenant','user','Contact',1,0,{sortField:'Name',sortDirection:'asc'});
  assert.ok(first.nextCursor);
  const cursor=parseRecordCursor(first.nextCursor);
  assert.equal(cursor?.value,'Ada');
  const second=await engine.list('tenant','user','Contact',1,0,{
    sortField:'Name',sortDirection:'asc',cursor,
  });
  assert.equal(second.records[0].Id,ids[1]);
  assert.equal(first.total,2);
  const pageQuery=calls.filter(call=>call.sql.includes('WITH authorized AS MATERIALIZED'))[1];
  assert.match(pageQuery.sql,/r\.id>\$\d+::uuid/);
  assert.equal((pageQuery.sql.match(/md_record_access\(/g)??[]).length,1);
  assert.ok(pageQuery.args.includes(ids[0]));
});
