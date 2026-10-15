import assert from 'node:assert/strict';
import test from 'node:test';
import { chatterIncomingIdentityFields } from '../apps/server/src/modules/chatter/webhook-identity.mjs';

const withChannel = { fields: [{ apiName: 'Channel_Account__c' }] };
const legacy = { fields: [{ apiName: 'Message_Body__c' }] };

test('signed Meta Phone Number ID populates the trusted Chatter channel', () => {
  assert.deepEqual(chatterIncomingIdentityFields(withChannel, '447000111222', '447000555666', '123456789012'), {
    Direction__c: 'Incoming', From_Number__c: '447000111222',
    To_Number__c: '447000555666', Channel_Account__c: '123456789012'
  });
});

test('older metadata remains compatible until its channel field is installed', () => {
  assert.equal('Channel_Account__c' in chatterIncomingIdentityFields(legacy, '447000111222', '', '123456789012'), false);
});

test('unsigned, missing or forged account identities are rejected', () => {
  for (const value of ['', 'abc', '../messages', ' 123456789012 ']) {
    assert.throws(() => chatterIncomingIdentityFields(withChannel, '447000111222', '', value));
  }
});
