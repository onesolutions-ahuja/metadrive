import test from 'node:test';
import assert from 'node:assert/strict';
import { rowsFrom, outcomesFrom, screenOutcomesFrom, displayValue } from './flowEditorData.ts';

test('agent4: flow editor only accepts object rows', () => {
  assert.deepEqual(rowsFrom(null), []);
  assert.deepEqual(rowsFrom([{ name: 'valid' }, null, 3, []]), [{ name: 'valid' }]);
});

test('agent4: decision outcomes preserve metadata while supplying labels', () => {
  const result = outcomesFrom([{ name: 'Approved', conditions: [{ logic: 'Any' }] }, {}]);
  assert.equal(result[0].name, 'Approved');
  assert.equal(result[0].conditionLogic, 'Any');
  assert.equal(result[1].name, 'Outcome_2');
  assert.equal(result[1].conditionLogic, 'All');
});

test('agent4: screen outcome fallback remains unchanged', () => {
  assert.deepEqual(screenOutcomesFrom([]), [{ name: 'Default', label: 'Next' }]);
  assert.deepEqual(screenOutcomesFrom([{ label: 'Continue' }]), [{ name: 'Outcome_1', label: 'Continue' }]);
});

test('agent4: displayed values do not stringify objects', () => {
  assert.equal(displayValue(42), '42');
  assert.equal(displayValue('hello'), 'hello');
  assert.equal(displayValue({ secret: 1 }), '');
});
