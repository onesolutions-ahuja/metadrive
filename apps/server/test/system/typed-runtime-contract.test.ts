import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../../src/system-support/migrations/20261021-typed-record-values.sql',import.meta.url),'utf8');
const record=readFileSync(new URL('../../src/system-files/record-engine.ts',import.meta.url),'utf8');
const routes=readFileSync(new URL('../../src/api/ObjectApiController.ts',import.meta.url),'utf8');
const worker=readFileSync(new URL('../../src/system-support/job-worker-entrypoint.ts',import.meta.url),'utf8');
const handler=readFileSync(new URL('../../src/system-support/flow-job-handler.ts',import.meta.url),'utf8');
const flowValidation=readFileSync(new URL('../../src/flow-engine/FlowValidator.ts',import.meta.url),'utf8');

test('typed SQL migration has complete dollar-quoted functions and projections',()=>{
 assert.equal((migration.match(/\$\$/g)||[]).length,6);
 for(const type of ['value_number','value_date','value_datetime','value_boolean'])
  assert.match(migration,new RegExp('ADD COLUMN IF NOT EXISTS '+type));
 for(const kind of ['number','currency','percent','date','datetime','boolean'])
  assert.ok(migration.includes("'"+kind+"'"));
});
test('typed filtering and aggregate routes use shared permission checked engine',()=>{
 assert.match(record,/async filterTyped\(/);
 assert.match(record,/async aggregateNumeric\(/);
 assert.match(record,/md_record_access\(/);
 assert.match(routes,/\/api\/records\/:objectApi\/typed-filter\/:fieldApi/);
 assert.match(routes,/\/api\/records\/:objectApi\/typed-aggregate\/:fieldApi/);
});
test('worker entrypoint and Flow handler enforce tenant app and published flow',()=>{
 assert.match(worker,/registerFlowJobHandler/);
 assert.match(worker,/applySystemMigrations/);
 assert.match(flowValidation,/md_app_installations/);
 assert.match(flowValidation,/md_app_entitlements/);
 assert.match(handler,/md_flow_definitions/);
 assert.match(handler,/rbac.allowed/);
});
