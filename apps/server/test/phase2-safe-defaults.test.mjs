import test from 'node:test';
import assert from 'node:assert/strict';
import {safeEmptySettings,planSafeDefaults,assessCutover} from '../src/modules/metadata/phase2-safe-defaults.mjs';
test('only empty nonsecurity settings are initialized',()=>{
 const rows=[{tenant_id:'t',setting_name:'scheduleRuns',payload:null},
 {tenant_id:'t',setting_name:'accessControl',payload:null},
 {tenant_id:'t',setting_name:'sharingSettings',payload:null},
 {tenant_id:'t',setting_name:'scheduleRetries',payload:{existing:true}}];
 assert.deepEqual(planSafeDefaults(rows),[{tenantId:'t',settingName:'scheduleRuns',payload:{}}]);
 assert.deepEqual(Object.keys(safeEmptySettings).sort(),['autoNumberSequences','automationSettings','scheduleRetries','scheduleRuns'].sort());
});
test('cutover fails closed for any unresolved metadata',()=>{
 assert.equal(assessCutover({unresolvedSettings:1}).ready,false);
 assert.equal(assessCutover({unresolvedSettings:0}).ready,true);
});
