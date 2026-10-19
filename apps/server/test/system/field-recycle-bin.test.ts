import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ObjectDefinitionService} from '../../src/system-files/object-definition.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

const metadataResult=(sql:string)=>{
  if(sql.includes('FROM md_object_definitions'))
    return {rows:[{id:'object',api_name:'Invoice__c',label:'Invoice',is_system:false}]};
  if(sql.includes('FROM md_field_definitions f LEFT JOIN'))return {rows:[]};
  if(sql.includes('FROM md_object_'))return {rows:[]};
  return null;
};

test('deleted fields can be restored within the 15-day recycle period',async()=>{
  const statements:string[]=[];
  const client={query:async(sql:string)=>{
    statements.push(sql);
    if(sql.includes('SELECT object_api,api_name,id'))return {rows:[]};
    if(sql.includes('UPDATE md_field_definitions SET deleted_at=NULL'))return {rows:[{id:'field'}],rowCount:1};
    return {rows:[],rowCount:1};
  }};
  const db={
    query:async(sql:string)=>metadataResult(sql)??{rows:[]},
    transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)
  } as unknown as SqlPersistence;
  const restored=await new ObjectDefinitionService(db).restoreField('tenant','Invoice__c','Total');
  assert.equal(restored.apiName,'Invoice__c');
  const restore=statements.find(sql=>sql.includes('UPDATE md_field_definitions SET deleted_at=NULL'));
  assert.ok(restore?.includes("deleted_at>now()-interval '15 days'"));
});

test('expired deleted fields and their retained data are purged',async()=>{
  const statements:string[]=[];
  let expiredFound=false;
  const client={query:async(sql:string)=>{
    statements.push(sql);
    if(sql.includes('SELECT object_api,api_name,id'))
      return expiredFound?{rows:[]}:(expiredFound=true,{rows:[{object_api:'Invoice__c',api_name:'OldValue',id:'field'}]});
    if(sql.startsWith('DELETE FROM md_field_definitions'))return {rows:[],rowCount:1};
    return {rows:[],rowCount:1};
  }};
  const db={
    query:async(sql:string)=>metadataResult(sql)??{rows:[]},
    transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)
  } as unknown as SqlPersistence;
  const deleted=await new ObjectDefinitionService(db).listDeletedFields('tenant','Invoice__c');
  assert.deepEqual(deleted.fields,[]);
  assert.ok(statements.some(sql=>sql.includes('DELETE FROM md_record_values')));
  assert.ok(statements.some(sql=>sql.includes('DELETE FROM md_record_history')));
  assert.ok(statements.some(sql=>sql.includes('DELETE FROM md_object_page_layout_fields')));
  assert.ok(statements.some(sql=>sql.includes('DELETE FROM md_object_record_type_values')));
  assert.ok(statements.some(sql=>sql.includes('DELETE FROM md_page_component_properties')));
  assert.ok(statements.some(sql=>sql.startsWith('DELETE FROM md_field_definitions')));
});

test('scheduled cleanup purges expired fields across tenants',async()=>{
  const tenants=['tenant-a','tenant-b'];
  type CleanupRow={object_api:string;api_name:string;id:string};
  type CleanupClient={query:(sql:string,args?:readonly unknown[])=>Promise<{rows:CleanupRow[];rowCount:number}>};
  const db={
    query:async(sql:string)=>{
      assert.match(sql,/SELECT DISTINCT tenant_id FROM md_field_definitions/);
      return {rows:tenants.map(tenant_id=>({tenant_id}))};
    },
    transaction:async(run:(client:CleanupClient)=>Promise<number>)=>{
      const client:CleanupClient={query:async(sql,args=[])=>{
        if(sql.includes('SELECT object_api,api_name,id'))
          return {rows:[{object_api:'Invoice__c',api_name:'OldValue',id:String(args[0])}],rowCount:1};
        return {rows:[],rowCount:1};
      }};
      return run(client);
    }
  } as unknown as SqlPersistence;
  assert.equal(await new ObjectDefinitionService(db).purgeExpiredFields(),2);
});
