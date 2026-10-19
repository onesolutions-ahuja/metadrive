import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {flowCreateOptions,flowElementAvailable,type FlowCapabilityCatalog} from '../src/core/builders/FlowBuilder/flowCapabilityCatalog';

const migration=readFileSync(new URL('../../server/src/system-support/migrations/20261112-flow-capability-registry.sql',import.meta.url),'utf8');
const permitted=['Screen Flow','Autolaunched Flow','Record-Triggered Flow'];
const catalog:FlowCapabilityCatalog={registryVersion:1,
 flowTypes:permitted.map((type,index)=>({type:type as FlowCapabilityCatalog['flowTypes'][number]['type'],
  description:type,createEnabled:index<2,validateEnabled:true,debugEnabled:true})),
 elements:[
  {type:'Get Records',group:'Data',icon:'↓',builderEnabled:false,beforeSaveAllowed:false,
   configSchemaKey:'flow:Get Records',validatorKey:'Get Records',runtimeHandlerKey:'Get Records',
   debugBehavior:'unsupported',allowedFlowTypes:permitted,builderFlowTypes:[],properties:[]},
  {type:'Assignment',group:'Logic',icon:'⇄',builderEnabled:true,beforeSaveAllowed:true,
   configSchemaKey:'flow:Assignment',validatorKey:'Assignment',runtimeHandlerKey:'Assignment',
   debugBehavior:'execute',allowedFlowTypes:permitted,builderFlowTypes:permitted,properties:[]}
 ]};

test('capability metadata gates unsupported UI options without hiding execution metadata',()=>{
 assert.equal(flowCreateOptions(catalog).length,2);
 assert.equal(flowElementAvailable(catalog,'Get Records','Autolaunched Flow','after-save'),false);
 assert.equal(flowElementAvailable(catalog,'Assignment','Record-Triggered Flow','before-save'),true);
 assert.equal(flowElementAvailable(null,'Assignment','Autolaunched Flow','after-save'),false);
 assert.equal(flowElementAvailable(catalog,'Unexpected','Screen Flow','after-save'),false);
});

test('Core SQL registry covers historical elements and does not overwrite tenant edits',()=>{
 for(const name of ['Get Records','Update Records','Delete Records','Subflow','Collection Filter',
  'Collection Sort','Transform','Publish Platform Event','Screen','Create Records'])
   assert.ok(migration.includes("'"+name+"'"),'Missing registry element: '+name);
 assert.match(migration,/ON CONFLICT \(element_type\) DO NOTHING/i);
 assert.doesNotMatch(migration,/jsonb|ON CONFLICT.+DO UPDATE/i);
});
