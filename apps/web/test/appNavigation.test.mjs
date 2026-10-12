import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileNavigationOrder, moveNavigationEntry } from '../src/appNavigation.ts';

test('preserves explicit mixed object and page order across a metadata round-trip', () => {
  const order = [{ type: 'App Page', apiName: 'Overview' }, { type: 'Object', apiName: 'Contact' }, { type: 'Object', apiName: 'Account' }];
  assert.deepEqual(reconcileNavigationOrder(['Account', 'Contact'], ['Overview'], order), order);
});
test('handles legacy empty order, app-pages-only apps and newly selected navigation', () => {
  assert.deepEqual(reconcileNavigationOrder(['Account'], ['Overview'], []), [
    { type: 'Object', apiName: 'Account' }, { type: 'App Page', apiName: 'Overview' }
  ]);
  assert.deepEqual(reconcileNavigationOrder([], ['Overview'], []), [{ type: 'App Page', apiName: 'Overview' }]);
});
test('removes stale and duplicate items without modifying the original metadata', () => {
  const input = [{ type: 'Object', apiName: 'Account' }, { type: 'Object', apiName: 'Account' }, { type: 'Object', apiName: 'Deleted' }, { type: 'App Page', apiName: 'Inactive' }];
  assert.deepEqual(reconcileNavigationOrder(['Account'], ['Overview'], input), [
    { type: 'Object', apiName: 'Account' }, { type: 'App Page', apiName: 'Overview' }
  ]);
  assert.equal(input.length, 4);
});
test('moves navigation up and down and ignores out-of-range moves', () => {
  const order = reconcileNavigationOrder(['Account', 'Contact'], ['Overview']);
  const moved = moveNavigationEntry(order, 2, 0);
  assert.deepEqual(moved.map(({ apiName }) => apiName), ['Overview', 'Account', 'Contact']);
  assert.deepEqual(order.map(({ apiName }) => apiName), ['Account', 'Contact', 'Overview']);
  assert.deepEqual(moveNavigationEntry(order, 0, -1), order);
});
