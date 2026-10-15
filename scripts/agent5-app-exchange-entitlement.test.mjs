import assert from 'node:assert/strict';
import test from 'node:test';
import { connectorEntitlement } from '../apps/server/src/connector-app-runtime.ts';

const now = new Date('2026-10-15T12:00:00.000Z');
const credential = { id: 'one', name: 'SHARED' };
const licensed = {
  Name: 'App A', CredentialName__c: 'SHARED', Installed__c: true,
  LicenceExpiresAt__c: '2026-11-15T12:00:00.000Z'
};

test('AppExchange denies ambiguous credential ownership independent of record order', () => {
  const duplicate = { ...licensed, Name: 'App B', Installed__c: false };
  for (const apps of [[licensed, duplicate], [duplicate, licensed]]) {
    const result = connectorEntitlement(apps, credential, now);
    assert.equal(result.allowed, false);
    assert.equal(result.managed, true);
    assert.match(result.message, /Multiple AppExchange installations/);
  }
});

test('AppExchange preserves licensed, uninstalled and unmanaged credential semantics', () => {
  assert.equal(connectorEntitlement([licensed], credential, now).allowed, true);
  assert.equal(connectorEntitlement([{...licensed, Installed__c: false}], credential, now).allowed, false);
  assert.deepEqual(connectorEntitlement([licensed], {id:'other',name:'OTHER'}, now), {
    allowed:true, message:'', managed:false
  });
});
