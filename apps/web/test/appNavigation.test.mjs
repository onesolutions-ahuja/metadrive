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

test('app navigation keeps object and page identities distinct even with the same API name', () => {
  const saved = [{ type: 'App Page', apiName: 'Dashboard' }, { type: 'Object', apiName: 'Dashboard' }];
  assert.deepEqual(reconcileNavigationOrder(['Dashboard'], ['Dashboard'], saved), saved);
});

test('app navigation drops revoked metadata entries and does not resurrect them on reorder', () => {
  const saved = [
    { type: 'Object', apiName: 'Restricted' },
    { type: 'App Page', apiName: 'Visible' },
    { type: 'Object', apiName: 'Public' }
  ];
  const permitted = reconcileNavigationOrder(['Public'], ['Visible'], saved);
  assert.deepEqual(permitted.map(e => e.apiName), ['Visible', 'Public']);
  assert.deepEqual(moveNavigationEntry(permitted, 1, 0).map(e => e.apiName), ['Public', 'Visible']);
  assert.equal(saved.length, 3);
});

test('app navigation safely ignores invalid reorder indexes', () => {
  const entries = reconcileNavigationOrder(['Account'], ['Home']);
  for (const [from, to] of [[-1, 0], [0, 3], [0.5, 1], [0, Number.NaN]]) {
    assert.deepEqual(moveNavigationEntry(entries, from, to), entries);
  }
});
