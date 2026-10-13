import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFlowCollectionAssignment as apply } from '../src/flow-collection-assignment.mjs';

test('collection Assignment adds, prepends, and replaces without mutating source', () => {
  const initial = ['one'];
  assert.deepEqual(apply(initial, 'two', 'Add'), ['one', 'two']);
  assert.deepEqual(apply(initial, ['first', 'second'], 'Add At Beginning'), ['first', 'second', 'one']);
  assert.deepEqual(apply(initial, 'last', 'Add At End'), ['one', 'last']);
  assert.deepEqual(apply(initial, ['override'], 'Assign'), ['override']);
  assert.deepEqual(initial, ['one']);
  assert.deepEqual(apply(undefined, 'first', 'Add'), ['first']);
});
test('collection Assignment removes matching items and clears the collection', () => {
  assert.deepEqual(apply(['a', 'b', 'a'], 'a', 'Remove'), ['b']);
  assert.deepEqual(apply(['a', 'b'], undefined, 'Remove All'), []);
  const rows = [{ Id: 'record-1' }, { Id: 'record-2' }];
  assert.deepEqual(apply(rows, { Id: 'record-1' }, 'Remove', 'Record Collection'), [rows[1]]);
});
test('collection Assignment fails closed for incompatible operator and record values', () => {
  assert.throws(() => apply([1], 1, 'Divide'), /unavailable/);
  assert.throws(() => apply([], 'bad', 'Add', 'Record Collection'), /invalid value/);
  assert.throws(() => apply(undefined, 'single', 'Assign'), /collection value/);
  assert.throws(() => apply('not-list', 'value', 'Add'), /collection variable/);
});
