import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { appNavigationEntrySchema } from '../src/app-navigation-schema.js';

const navigationOrderSchema = z.array(appNavigationEntrySchema);

test('persisted legacy Page navigation decodes to canonical App Page without losing the destination', () => {
  const saved = [
    { type: 'Page', apiName: 'UNE_KIOSK' },
    { type: 'Object', apiName: 'Account' }
  ];
  assert.deepEqual(navigationOrderSchema.parse(saved), [
    { type: 'App Page', apiName: 'UNE_KIOSK' },
    { type: 'Object', apiName: 'Account' }
  ]);
  assert.equal(saved[0].type, 'Page', 'parsing must not mutate the original persisted state');
});

test('canonical App Page and Object navigation values remain unchanged', () => {
  const entries = [
    { type: 'App Page', apiName: 'UNE_KIOSK' },
    { type: 'Object', apiName: 'Contact' }
  ];
  assert.deepEqual(navigationOrderSchema.parse(entries), entries);
});

test('unknown navigation types and missing destinations remain invalid', () => {
  assert.equal(appNavigationEntrySchema.safeParse({ type: 'Unknown', apiName: 'UNE_KIOSK' }).success, false);
  assert.equal(appNavigationEntrySchema.safeParse({ type: 'Page', apiName: '' }).success, false);
  assert.equal(appNavigationEntrySchema.safeParse({ type: null, apiName: 'UNE_KIOSK' }).success, false);
});
