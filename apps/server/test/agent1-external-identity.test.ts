import assert from 'node:assert/strict';
import test from 'node:test';
import { externalIdentityRouteAllowed } from '../src/modules/security/external-identity-policy.js';

test('agent1: external identities have a narrow GET-only allowlist', () => {
  assert.equal(externalIdentityRouteAllowed('GET', '/api/auth/me'), true);
  assert.equal(externalIdentityRouteAllowed('GET', '/api/records/Account'), true);
  assert.equal(externalIdentityRouteAllowed('GET', '/api/records/Account/record_123'), true);
  for (const [method, path] of [
    ['POST', '/api/records/Account'], ['PATCH', '/api/records/Account/record_123'],
    ['GET', '/api/metadata/objects'], ['GET', '/api/flows'], ['GET', '/api/records/Account/record_123/shares'],
    ['GET', '/api/records/Account/record_123/extra'], ['GET', '/api/auth/session']
  ]) assert.equal(externalIdentityRouteAllowed(method, path), false, `${method} ${path}`);
});
