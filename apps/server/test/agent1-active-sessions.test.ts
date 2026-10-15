import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSessionSummaries } from '../src/modules/security/active-sessions.js';

test('agent1: session listing isolates tenant and user without exposing refresh secrets', () => {
  const sessions = [
    {userId:'u',tenantId:'a',familyId:'good',expiresAt:200,revokedAt:null,usedAt:null,mfaVerified:true,tokenHash:'secret'},
    {userId:'u',tenantId:'b',familyId:'other-tenant',expiresAt:200},
    {userId:'v',tenantId:'a',familyId:'other-user',expiresAt:200},
    {userId:'u',tenantId:'a',familyId:'expired',expiresAt:100},
    {userId:'u',tenantId:'a',familyId:'revoked',expiresAt:200,revokedAt:50},
    {userId:'u',tenantId:'a',familyId:'used',expiresAt:200,usedAt:50}
  ];
  assert.deepEqual(activeSessionSummaries(sessions,'u','a',100),[
    { familyId:'good',expiresAt:200,mfaVerified:true }
  ]);
});
