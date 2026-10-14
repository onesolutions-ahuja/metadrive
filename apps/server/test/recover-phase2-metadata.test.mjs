import test from 'node:test';
import assert from 'node:assert/strict';
import { constructRecoveryPlan } from '../scripts/recover-phase2-metadata.mjs';

const object = { apiName: 'Account', fields: [{ apiName: 'Name', dataType: 'Text' }] };
const component = { apiName: 'SharedPanel', surfaces: ['page', 'dashboard', 'flow'] };
const state = { tenants: { demo: { objects: [object] } }, libraryComponents: [component] };

test('recovery uses exact tenant/object name and component position', () => {
  const plan = constructRecoveryPlan(state,
    [{ tenant_id: 'demo', object_api_name: 'Account', position: 4 }],
    [{ position: 0 }]);
  assert.equal(plan.missing.length, 0);
  assert.deepEqual(plan.objectUpdates[0].payload, object);
  assert.deepEqual(plan.componentUpdates[0].payload, component);
});
test('recovery refuses unverified components instead of inventing metadata', () => {
  const plan = constructRecoveryPlan(state, [], [{ position: 39 }]);
  assert.deepEqual(plan.missing, ['component position 39']);
});
test('recovery refuses unverified objects', () => {
  const plan = constructRecoveryPlan(state,
    [{ tenant_id: 'demo', object_api_name: 'Unknown' }], []);
  assert.equal(plan.missing.length, 1);
});
test('recovery rejects incomplete or divergent metadata', () => {
  assert.throws(() => constructRecoveryPlan(
    { tenants: {}, libraryComponents: [{ label: 'Unknown' }] }, [], []));
  const plan = constructRecoveryPlan(state,
    [{ tenant_id: 'demo', object_api_name: 'Account', payload: { apiName: 'Account', fields: [] } }], []);
  assert.equal(plan.missing.length, 1);
});
