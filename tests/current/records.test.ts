import test from 'node:test';
import assert from 'node:assert/strict';
import {assertWritableRecordFields} from '../../apps/server/src/modules/records/record-write-fields.js';
import {planSafeDefaults,assessCutover} from '../../apps/server/src/modules/metadata/phase2-safe-defaults.mjs';

test('shared CRUD rejects unknown, audit and computed fields',()=>{
 const obj={apiName:'Appointment__c',fields:[{apiName:'Name'},{apiName:'Date__c'},{apiName:'Id'}]};
 assert.doesNotThrow(()=>assertWritableRecordFields(obj,{Name:'A'}));
 assert.throws(()=>assertWritableRecordFields(obj,{Unknown__c:'x'}),/does not exist/);
 assert.throws(()=>assertWritableRecordFields(obj,{Id:'x'}),/read-only/);
 assert.throws(()=>assertWritableRecordFields({apiName:'Opportunity',fields:[{apiName:'Age'}]},
  {Age:5}),/read-only/);
});
test('SQL safe-default planning does not overwrite tenant settings',()=>{
 const rows=[{tenant_id:'a',setting_name:'scheduleRuns',payload:null},
  {tenant_id:'a',setting_name:'scheduleRetries',payload:{custom:true}},
  {tenant_id:'a',setting_name:'credentialSecrets',payload:null}];
 const changes=planSafeDefaults(rows);
 assert.equal(changes.length,1);
 assert.equal(changes[0].settingName,'scheduleRuns');
 assert.deepEqual(changes[0].payload,{});
 assert.equal(assessCutover({missing:0}).ready,true);
 assert.equal(assessCutover({missing:1}).ready,false);
});
