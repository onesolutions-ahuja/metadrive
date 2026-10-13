import assert from 'node:assert/strict';
import test from 'node:test';
import {
  conversationKeyForIncoming, defaultAutomationSettings,
  expiredConversationInterview, retryDelayMs, retryBudgetExhausted, shouldTriggerInboundMessage, activeConversationContext, sameConversationSession
} from '../src/automation-policy.js';

test('failed execution retries are disabled by default', () => {
  assert.equal(defaultAutomationSettings.autoRetryFailedFlows, false);
  assert.equal(defaultAutomationSettings.conversationIdleMinutes, 15);
  assert.equal(defaultAutomationSettings.maxRetryAttempts, 10);
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

test('only fresh Meta events start a flow, old replay messages are archived', () => {
  const now = Date.parse('2026-10-11T09:00:00.000Z');
  const at = (agoMs: number) => String(Math.floor((now - agoMs) / 1000));
  assert.equal(shouldTriggerInboundMessage(at(14 * 60_000), now, 15), true);
  assert.equal(shouldTriggerInboundMessage(at(15 * 60_000), now, 15), false);
  assert.equal(shouldTriggerInboundMessage(at(3_600_000), now, 15), false);
  assert.equal(shouldTriggerInboundMessage(at(-20_000), now, 15), true);
  assert.equal(shouldTriggerInboundMessage(at(-120_000), now, 15), false);
  assert.equal(shouldTriggerInboundMessage(undefined, now, 15), false);
  assert.equal(shouldTriggerInboundMessage('not-a-time', now, 15), false);
});

test('conversation identity is independently scoped for one sender with multiple services', () => {
  const now = Date.parse('2026-10-11T09:45:00Z');
  const history = [
    { Direction__c: 'Incoming', From_Number__c: '44700001', Conversation_Context__c: 'Beauty',
      Conversation_Key__c: 'beauty-key', CreatedDate: new Date(now - 9 * 60_000).toISOString() },
    { Direction__c: 'Incoming', From_Number__c: '44700001', Conversation_Context__c: 'Legal',
      Conversation_Key__c: 'legal-key', CreatedDate: new Date(now - 4 * 60_000).toISOString() }
  ];
  assert.equal(activeConversationContext(history, '44700001', now, 15), 'Legal');
  assert.equal(conversationKeyForIncoming(history, '44700001', now, 15, 'Beauty'), 'beauty-key');
  assert.equal(conversationKeyForIncoming(history, '44700001', now, 15, 'Legal'), 'legal-key');
  assert.equal(activeConversationContext(history, '44700001', now + 16 * 60_000, 15), '');
  assert.equal(activeConversationContext(history, '44700002', now, 15), '');
});

test('an incoming Legal message does not renew an independent Beauty interview', () => {
  const beauty = { Conversation_Key__c: 'beauty-key', Conversation_Context__c: 'Beauty' };
  const lawyer = { Conversation_Key__c: 'legal-key', Conversation_Context__c: 'Legal' };
  assert.equal(sameConversationSession(beauty, lawyer), false);
  assert.equal(sameConversationSession(lawyer, lawyer), true);
  assert.equal(sameConversationSession({ ...lawyer, Conversation_Context__c: 'Beauty' }, lawyer), false);
  assert.equal(sameConversationSession(null, lawyer), false);
  assert.equal(sameConversationSession({ Conversation_Key__c: 'key' }, { Conversation_Key__c: 'key' }), true);
});

test('retry budgets stop on the final allowed attempt and reject invalid metadata',()=>{
  assert.equal(retryBudgetExhausted(1,10),false);
  assert.equal(retryBudgetExhausted(9,10),false);
  assert.equal(retryBudgetExhausted(10,10),true);
  assert.equal(retryBudgetExhausted(11,10),true);
  assert.equal(retryBudgetExhausted(1,1),true);
  assert.throws(()=>retryBudgetExhausted(0,10),/Invalid automation retry budget/);
  assert.throws(()=>retryBudgetExhausted(5,0),/Invalid automation retry budget/);
  assert.throws(()=>retryBudgetExhausted(5,21),/Invalid automation retry budget/);
  assert.throws(()=>retryBudgetExhausted(3.5,10),/Invalid automation retry budget/);
});
