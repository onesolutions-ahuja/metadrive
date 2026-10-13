import test from 'node:test';
import assert from 'node:assert/strict';
import { sealIntegrationEnvelope, openIntegrationEnvelope } from '../src/connector-envelope.js';
const ring = { activeKeyId: 'v1', keys: new Map([['v1',Buffer.alloc(32,7)]]) };
test('durable request encryption is randomized and never stores plaintext', () => {
  const body = { body: 'private message', credentialId: 'C', header: 'sensitive' };
  const one = sealIntegrationEnvelope('tenant-A','message-1',body,ring);
  const two = sealIntegrationEnvelope('tenant-A','message-1',body,ring);
  assert.notEqual(one,two);
  assert.ok(one.startsWith('enc:'));
  assert.equal(one.includes('private message'),false);
  assert.deepEqual(openIntegrationEnvelope('tenant-A','message-1',one,ring),body);
});
test('tenant isolation and operation replay protection are enforced by authenticated encryption', () => {
  const envelope = sealIntegrationEnvelope('tenant-A','order-1',{total:100},ring);
  assert.throws(()=>openIntegrationEnvelope('tenant-B','order-1',envelope,ring),/INTEGRATION_ENVELOPE_INVALID/);
  assert.throws(()=>openIntegrationEnvelope('tenant-A','order-2',envelope,ring),/INTEGRATION_ENVELOPE_INVALID/);
  const damaged=envelope.slice(0,-2)+'aa';
  assert.throws(()=>openIntegrationEnvelope('tenant-A','order-1',damaged,ring),/INTEGRATION_ENVELOPE_INVALID/);
});
test('existing encryption keys remain usable after active-key rotation', () => {
  const old=sealIntegrationEnvelope('tenant-A','op',{x:1},ring);
  const updated={activeKeyId:'v2',keys:new Map([...ring.keys,['v2',Buffer.alloc(32,8)]])};
  assert.deepEqual(openIntegrationEnvelope('tenant-A','op',old,updated),{x:1});
  const newer=sealIntegrationEnvelope('tenant-A','op',{x:2},updated);
  assert.deepEqual(openIntegrationEnvelope('tenant-A','op',newer,updated),{x:2});
});
