import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessChatterConversation, filterChatterConversations } from '../src/chatter-access-policy.js';

const principal = {
  tenantId: 'tenant-a', userId: 'alice', viewAllConversations: false,
  grants: [{ userId: 'alice', channelAccountId: 'phone-1', canRead: true, canSend: true, canAssign: false }]
};
const mine = { tenantId: 'tenant-a', channelAccountId: 'phone-1', assignedUserId: 'alice' };
test('allows assigned connection and denies unauthorized operations', () => {
  assert.equal(canAccessChatterConversation(principal, mine, 'read'), true);
  assert.equal(canAccessChatterConversation(principal, mine, 'send'), true);
  assert.equal(canAccessChatterConversation(principal, mine, 'assign'), false);
});
test('denies other tenant, ungranted phone and other user assignment', () => {
  assert.equal(canAccessChatterConversation(principal, {...mine,tenantId:'tenant-b'},'read'),false);
  assert.equal(canAccessChatterConversation(principal, {...mine,channelAccountId:'phone-2'},'read'),false);
  assert.equal(canAccessChatterConversation(principal, {...mine,assignedUserId:'bob'},'read'),false);
});
test('unrestricted conversation permission still requires channel grants', () => {
  const all = {...principal,viewAllConversations:true};
  assert.equal(canAccessChatterConversation(all,{...mine,assignedUserId:'bob'},'read'),true);
  assert.equal(canAccessChatterConversation(all,{...mine,channelAccountId:'phone-2'},'read'),false);
});
test('unassigned conversations are shared on authorised connection', () => {
  assert.equal(filterChatterConversations(principal,[mine,{...mine,assignedUserId:null},{...mine,tenantId:'other'}]).length,2);
});
