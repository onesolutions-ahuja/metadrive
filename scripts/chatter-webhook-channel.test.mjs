import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../apps/server/src/index.ts', import.meta.url)), 'utf8');
test('signed WhatsApp delivery persists the trusted phone ID as Chatter channel identity', () => {
  assert.match(source, /createHmac\('sha256', appSecret\)\.update\(rawBody\)/);
  assert.match(source, /Channel_Account__c: phoneId/);
  assert.match(source, /phoneId = phoneIds\[0\]/);
});
