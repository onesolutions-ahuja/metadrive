import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RecordEngine} from '../../src/system-files/record-engine.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

const parentId='00000000-0000-4000-8000-000000000001';
const refField={api_name:'AccountId',data_type:'reference',related_object:'Account__c',
  relationship_type:'Lookup',allow_reparenting:false,required:false,max_length:null,
  precision:null,scale:null,is_unique:false,external_id:false,case_sensitive:false,
  default_value:null,auto_number_format:null};

function setup(options:{parentVisible?:boolean;canReadField?:boolean;fieldType?:string}={}){
  const calls:Array<{sql:string;params:readonly unknown[]}>= [];
  const permissions:string[]=[];
  const client={query:async(sql:string,params:readonly unknown[]=[])=>{
    calls.push({sql,params});
    if(sql.includes('FROM md_field_definitions LEFT JOIN md_field_global_value_sets'))
      return {rows:[{...refField,data_type:options.fieldType??'reference'}],rowCount:1};
    if(sql.includes('SELECT id FROM md_records WHERE tenant_id='))
      return {rows:options.parentVisible===false?[]:[{id:parentId}],
        rowCount:options.parentVisible===false?0:1};
    if(sql.includes('SELECT count(*)::text AS total_count'))
      return {rows:[{total_count:'0'}],rowCount:1};
    return {rows:[],rowCount:0};
  }};
  const rbac={
    require:async(_tenant:string,_user:string,resource:string,action:string)=>{
      permissions.push(resource+':'+action);
    },
    requireRecord:async(_tenant:string,_user:string,resource:string,id:string,action:string)=>{
      permissions.push(resource+':'+id+':'+action);
    },
    allowed:async()=>options.canReadField!==false
  } as unknown as RbacEngine;
  return {recordEngine:new RecordEngine(client as unknown as SqlPersistence,rbac),calls,permissions};
}

test('related-list query restricts rows to the selected parent on the server',async()=>{
  const {recordEngine,calls,permissions}=setup();
  const result=await recordEngine.list('tenant','actor','Invoice__c',50,0,
    {relatedField:'AccountId',relatedId:parentId});
  assert.deepEqual(result,{records:[],total:0});
  const records=calls.find(call=>call.sql.includes('WITH authorized AS MATERIALIZED'));
  assert.ok(records);
  assert.match(records.sql,/SELECT count\(\*\)::text AS total_count FROM authorized/);
  assert.match(records.sql,/FROM authorized a JOIN md_records r/);
  assert.match(records.sql,/relation\.reference_record_id=\$5::uuid/);
  assert.match(records.sql,/relation\.tenant_id=r\.tenant_id/);
  assert.ok(records.params.includes('AccountId'));
  assert.ok(records.params.includes(parentId));
  assert.ok(permissions.includes('Account__c:read'));
  assert.ok(permissions.includes('Account__c:'+parentId+':read'));
});

test('related-list filtering rejects missing parent, invalid field, and incomplete arguments',async()=>{
  const {recordEngine}=setup();
  await assert.rejects(()=>recordEngine.list('tenant','actor','Invoice__c',50,0,
    {relatedField:'AccountId'}),/both relationship field and parent record/);
  await assert.rejects(()=>recordEngine.list('tenant','actor','Invoice__c',50,0,
    {relatedField:'AccountId',relatedId:'invalid'}),/Invalid related-list relationship/);
  const nonRelationship=setup({fieldType:'text'});
  await assert.rejects(()=>nonRelationship.recordEngine.list('tenant','actor','Invoice__c',50,0,
    {relatedField:'AccountId',relatedId:parentId}),/Invalid related-list relationship/);
});

test('related-list filtering rejects parent records unavailable to the actor',async()=>{
  const hidden=setup({parentVisible:false});
  await assert.rejects(()=>hidden.recordEngine.list('tenant','actor','Invoice__c',50,0,
    {relatedField:'AccountId',relatedId:parentId}),/Related parent record not found/);
  const unreadable=setup({canReadField:false});
  await assert.rejects(()=>unreadable.recordEngine.list('tenant','actor','Invoice__c',50,0,
    {relatedField:'AccountId',relatedId:parentId}),/Field is not readable/);
});
