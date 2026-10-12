import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { parseApiClients, verifiedApiClient } from '../src/api-client-auth.js';
const secret = 'a'.repeat(48);
const config = [{id:'client-1',tenantId:'tenant-a',userId:'user-a',
  keySha256:createHash('sha256').update(secret).digest('hex'),expiresAt:'2030-01-01T00:00:00Z'}];
test('verified client secret is bound to authenticated tenant and user, not origin headers', () => {
 const clients=parseApiClients(JSON.stringify(config));
 assert.equal(verifiedApiClient(clients,'client-1',secret,'tenant-a','user-a',Date.parse('2026-01-01')), 'client-1');
 assert.equal(verifiedApiClient(clients,'client-1',secret,'tenant-b','user-a'),null);
 assert.equal(verifiedApiClient(clients,'client-1',secret,'tenant-a','user-b'),null);
 assert.equal(verifiedApiClient(clients,'client-1','b'.repeat(48),'tenant-a','user-a'),null);
 assert.equal(verifiedApiClient(clients,undefined,undefined,'tenant-a','user-a'),null);
});
test('expiry boundary and revocation are checked with the live clock', () => {
 const clients=parseApiClients(JSON.stringify(config)); const expiry=Date.parse(config[0].expiresAt);
 assert.equal(verifiedApiClient(clients,'client-1',secret,'tenant-a','user-a',expiry-1),'client-1');
 assert.equal(verifiedApiClient(clients,'client-1',secret,'tenant-a','user-a',expiry),null);
 const revoked=parseApiClients(JSON.stringify([{...config[0],revokedAt:'2026-10-12T13:00:00Z'}]));
 assert.equal(verifiedApiClient(revoked,'client-1',secret,'tenant-a','user-a',Date.parse('2026-10-12T12:59:59Z')),'client-1');
 assert.equal(verifiedApiClient(revoked,'client-1',secret,'tenant-a','user-a',Date.parse('2026-10-12T13:00:00Z')),null);
});
test('malformed client secrets and duplicate IDs fail closed', () => {
 assert.throws(()=>parseApiClients('[{"id":"x"}]'),/Invalid API client/);
 assert.throws(()=>parseApiClients(JSON.stringify([config[0],config[0]])),/Duplicate/);
 assert.deepEqual(parseApiClients(undefined),[]);
});
