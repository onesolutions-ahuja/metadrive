import assert from 'node:assert/strict';
import test from 'node:test';
import { newTotpSecret, totpCode, totpUri, verifyTotp } from '../src/mfa.js';

test('TOTP uses RFC 6238 SHA-1 and denies code reuse', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totpCode(secret, 1), '287082');
  assert.equal(verifyTotp(secret, '287082', -1, 59_000), 1);
  assert.equal(verifyTotp(secret, '287082', 1, 59_000), null);
  assert.equal(verifyTotp(secret, '000000', -1, 59_000), null);
  assert.equal(verifyTotp(secret, '287082', -1, 200_000), null);
});

test('TOTP setup creates distinct 160-bit seeds and tenant-neutral authenticator URI', () => {
  const first = newTotpSecret();
  const second = newTotpSecret();
  assert.match(first, /^[A-Z2-7]{32}$/);
  assert.notEqual(first, second);
  assert.match(totpUri(first, 'user@example.test'), /^otpauth:\/\/totp\/MetaDrive%3Auser%40example.test\?secret=/);
});
