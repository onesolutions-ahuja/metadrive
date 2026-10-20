import test from 'node:test';
import assert from 'node:assert/strict';
import type {PoolClient} from 'pg';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {RecordListViewService} from '../../src/system-support/record-list-view-service.js';

const id='123e4567-e89b-42d3-a456-426614174000';
const row={id,object_api:'Account',owner_id:'user',label:'High Value',
  visibility:'private' as const,scope:'all' as const,filter_logic:'1',
  sort_field:'Name',sort_direction:'asc' as const,pinned:false};

test('list view save persists relational filters and requests the record field permission',async()=>{
  const writes:Array<{sql:string;args:unknown[]}>= [];
  const db={
    query:async(sql:string)=>{
      if(sql.includes('FROM md_field_definitions'))return {rows:[
        {api_name:'Name',data_type:'text',rollup_source_data_type:null},
      ]};
      throw new Error('Unexpected database query: '+sql);
    },
    transaction:async<T>(work:(client:PoolClient)=>Promise<T>)=>work({
      query:async(sql:string,args:unknown[]=[])=>{
        writes.push({sql,args});
        if(sql.includes('INSERT INTO md_list_views'))return {rows:[{id}],rowCount:1};
        if(sql.includes('SELECT v.id,v.object_api'))return {rows:[row]};
        if(sql.includes('SELECT field_api FROM md_list_view_columns'))return {rows:[{field_api:'Name'}]};
        if(sql.includes('SELECT position,field_api,operator,value_text'))return {rows:[
          {position:0,field_api:'Name',operator:'contains',value_text:'Acme'},
        ]};
        return {rows:[],rowCount:1};
      },
    } as unknown as PoolClient),
  } as unknown as SqlPersistence;
  const grants:string[]=[];
  const rbac={require:async(_tenant:string,_user:string,resource:string,action:string)=>{
    grants.push(`${resource}.${action}`);
  }} as unknown as RbacEngine;
  const service=new RecordListViewService(db,rbac);
  const saved=await service.save('tenant','user','Account',{
    label:'High Value',visibility:'private',scope:'all',columns:['Name'],
    filters:[{field:'Name',operator:'contains',value:'Acme'}],filterLogic:'1',
    sortField:'Name',sortDirection:'asc',
  });
  assert.equal(saved.id,id);
  assert.deepEqual(saved.columns,['Name']);
  assert.deepEqual(saved.filters,[{field:'Name',operator:'contains',value:'Acme'}]);
  assert.ok(grants.includes('Account.Name.read'));
  assert.ok(writes.some(write=>write.sql.includes('INSERT INTO md_list_view_filters')));
  assert.ok(writes.some(write=>write.sql.includes('INSERT INTO md_list_view_columns')));
});

test('list view sharing requires object manage permission',async()=>{
  const db={query:async()=>({rows:[]})} as unknown as SqlPersistence;
  const rbac={require:async(_tenant:string,_user:string,_resource:string,action:string)=>{
    if(action==='manage')throw new Error('Not authorized');
  }} as unknown as RbacEngine;
  const service=new RecordListViewService(db,rbac);
  await assert.rejects(()=>service.save('tenant','user','Account',{
    label:'Shared',visibility:'all',scope:'all',columns:[],filters:[],
  }),/Not authorized/);
});
