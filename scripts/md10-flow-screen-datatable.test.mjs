import test from 'node:test';
import assert from 'node:assert/strict';
import { validFlowScreenSelection } from '../apps/web/src/flowScreenDataTableSelection.mjs';
const records = [{Id:'a'}, {Id:'b'}, {Id:'b'}, {Id:null}];
test('removes stale IDs and duplicated selections', () => {
  assert.deepEqual(validFlowScreenSelection(['a','stale','b','a'], records, true), ['a','b']);
});
test('single selection preserves only one authorized table row', () => {
  assert.deepEqual(validFlowScreenSelection(['stale','b','a'], records, false), ['b']);
  assert.deepEqual(validFlowScreenSelection('missing', records, false), []);
});
test('malformed values and collections cannot create phantom selections', () => {
  assert.deepEqual(validFlowScreenSelection([null, 2, {}, 'a'], records, true), ['a']);
  assert.deepEqual(validFlowScreenSelection('b', [], false), []);
});
