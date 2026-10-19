import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ObjectDefinitionService} from '../../src/system-files/object-definition.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

test('global picklist fields store a value-set link and expose its active values',async()=>{
  const writes:Array<{sql:string;args:readonly unknown[]}>=[];
  const fieldRow={
    id:'field-id',object_api:'Lead__c',api_name:'Region',label:'Region',data_type:'picklist',
    related_object:null,relationship_type:null,required:false,max_length:null,precision:null,scale:null,
    is_unique:false,external_id:false,case_sensitive:false,default_value:null,help_text:null,description:null,
    formula_expression:null,formula_return_type:null,auto_number_format:null,rollup_child_object:null,
    rollup_relationship_field:null,rollup_operation:null,rollup_source_field:null,picklist_restricted:true,
    controller_field_api_name:null,global_value_set_api:'Regions',relationship_name:null,
    child_relationship_name:null,delete_behavior:null,allow_reparenting:false
  };
  const query=async(sql:string,args:readonly unknown[]=[])=>{
    if(sql.includes('SELECT v.value FROM md_global_value_sets s'))
      return {rows:[{value:'North'},{value:'South'}],rowCount:2};
    if(sql.includes('INSERT INTO md_field_definitions'))return {rows:[{id:'field-id'}],rowCount:1};
    if(sql.includes('SELECT id,api_name,label,is_system FROM md_object_definitions'))
      return {rows:[{id:'object-id',api_name:'Lead__c',label:'Lead',is_system:false}],rowCount:1};
    if(sql.includes('FROM md_field_definitions f LEFT JOIN'))
      return {rows:[fieldRow],rowCount:1};
    if(sql.includes('SELECT g.object_api,g.field_api,v.value'))
      return {rows:[{object_api:'Lead__c',field_api:'Region',value:'North'},
        {object_api:'Lead__c',field_api:'Region',value:'South'}],rowCount:2};
    if(sql.startsWith('SELECT * FROM'))return {rows:[],rowCount:0};
    if(sql.includes('md_object_record_types')||sql.includes('md_object_record_type_values'))
      return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO md_field_global_value_sets'))writes.push({sql,args});
    if(sql.includes('INSERT INTO md_field_picklist_values'))writes.push({sql,args});
    return {rows:[],rowCount:1};
  };
  const db={
    query,
    transaction:async<T>(run:(client:unknown)=>Promise<T>)=>run({query})
  } as unknown as SqlPersistence;

  const definitions=new ObjectDefinitionService(db);
  await definitions.addField(
    'tenant','Lead__c','Region','Picklist',undefined,'Region',{globalValueSetApiName:'Regions'}
  );
  const result=await definitions.get('tenant','Lead__c');
  const field=result.fields.find(item=>item.apiName==='Region');
  assert.equal(field?.globalValueSetApiName,'Regions');
  assert.deepEqual(field?.picklistValues,['North','South']);
  assert.equal(writes.filter(item=>item.sql.includes('INSERT INTO md_field_global_value_sets')).length,1);
  assert.equal(writes.some(item=>item.sql.includes('INSERT INTO md_field_picklist_values')),false);
});
