import assert from 'node:assert/strict';
import test from 'node:test';
import {
  conversationKeyForIncoming, defaultAutomationSettings,
  expiredConversationInterview, retryDelayMs
} from '../src/automation-policy.js';

test('failed execution retries are disabled by default', () => {
  assert.equal(defaultAutomationSettings.autoRetryFailedFlows, false);
  assert.equal(defaultAutomationSettings.conversationIdleMinutes, 15);
  assert.equal(retryDelayMs(1), 60_000);
  assert.equal(retryDelayMs(8), 3_600_000);
});

test('conversation identity expires after 15 minutes of inactivity', () => {
  const now = Date.parse('2026-10-11T07:30:00.000Z');
  const earlier = {Direction__c: 'Incoming', From_Number__c: '447000000000', Conversation_Key__c: 'active-key', CreatedDate: new Date(now - 14 * 60_000).toISOString()};
  assert.equal(conversationKeyForIncoming([earlier], '447000000000', now, 15), 'active-key');
  assert.notEqual(conversationKeyForIncoming([earlier], '447000000000', now + 60_000, 15), 'active-key');
  assert.notEqual(conversationKeyForIncoming([earlier], '447111111111', now, 15), 'active-key');
  assert.equal(expiredConversationInterview({Conversation_Key__c: 'active-key'}, new Date(now).toISOString(), now + 14 * 60_000, 15), false);
  assert.equal(expiredConversationInterview({Conversation_Key__c: 'active-key'}, new Date(now).toISOString(), now + 15 * 60_000, 15), true);
  assert.equal(expiredConversationInterview({Other: true}, new Date(now).toISOString(), now + 60 * 60_000, 15), false);
});
