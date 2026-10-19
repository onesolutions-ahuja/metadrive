import test from 'node:test';
import assert from 'node:assert/strict';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {loadFlowCapabilityCatalog} from '../../src/system-files/flow-capability-catalog.js';

const tenant='00000000-0000-4000-8000-000000000001';

test('SQL Flow catalog returns flow types, allowed elements, editor flags and property contracts',async()=>{
 const seen:Array<{sql:string;params:unknown[]}> = [];
 const db={query:async(sql:string,params:unknown[]=[])=>{
   seen.push({sql,params});
   if(sql.includes('FROM md_flow_capability_flow_types'))return {rows:[
     {flow_type:'Autolaunched Flow',description:'Autolaunched',create_enabled:true,
      validate_enabled:true,debug_enabled:true}
   ]};
   if(sql.includes('FROM md_flow_capability_elements e'))return {rows:[
     {element_type:'Assignment',display_group:'Logic',display_icon:'⇄',builder_enabled:true,
      before_save_allowed:true,config_schema_key:'flow:Assignment',validator_key:'Assignment',
      runtime_handler_key:'Assignment',debug_behavior:'execute',registry_version:1},
     {element_type:'Get Records',display_group:'Data',display_icon:'↓',builder_enabled:false,
      before_save_allowed:false,config_schema_key:'flow:Get Records',validator_key:'Get Records',
      runtime_handler_key:'Get Records',debug_behavior:'unsupported',registry_version:1}
   ]};
   if(sql.includes('FROM md_flow_capability_element_flows'))return {rows:[
     {element_type:'Assignment',flow_type:'Autolaunched Flow',builder_allowed:true},
     {element_type:'Get Records',flow_type:'Autolaunched Flow',builder_allowed:false}
   ]};
   if(sql.includes('FROM md_flow_capability_properties'))return {rows:[
     {element_type:'Get Records',property_name:'object',value_type:'text',required:true}
   ]};
   throw new Error('Unexpected query');
 }} as unknown as SqlPersistence;
 const result=await loadFlowCapabilityCatalog(db,tenant);
 assert.equal(result.flowTypes[0].createEnabled,true);
 assert.equal(result.registryVersion,1);
 assert.deepEqual(result.elements[0].builderFlowTypes,['Autolaunched Flow']);
 assert.equal(result.elements[1].builderEnabled,false);
 assert.deepEqual(result.elements[1].allowedFlowTypes,['Autolaunched Flow']);
 assert.deepEqual(result.elements[1].properties,[{name:'object',valueType:'text',required:true}]);
 assert.ok(seen.some(row=>row.sql.includes('md_app_installations')&&row.sql.includes('md_app_entitlements')
   &&row.params[0]===tenant),'Tenant app entitlement must be enforced in SQL');
});
