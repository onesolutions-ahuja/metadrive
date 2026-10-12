import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTenantDomain, domainChallenge, matchesDomainChallenge,
  reservedDomain, verifiedHostTenant } from '../src/tenant-domains.mjs';

test('MD-03.5: strict canonical domain validation', () => {
  assert.equal(normalizeTenantDomain('App.Customer.Example'), 'app.customer.example');
  assert.equal(normalizeTenantDomain('shop.example.co.uk.'), 'shop.example.co.uk');
  for (const host of ['example', 'http://example.com', '*.example.com', 'a..example.com',
    'foo.example.com:443', ' foo.example.com', 'a_b.example.com', 'example.com/path',
    '127.0.0.1', 'internal.local', 'foo.example.invalid', '-bad.example.com']) {
    assert.throws(() => normalizeTenantDomain(host), undefined, host);
  }
});
test('MD-03.5: TXT proof matches one complete record only', () => {
  const proof = domainChallenge('app.example.com', 'token-123');
  assert.deepEqual(proof, { type: 'TXT', host: '_metadrive-verification.app.example.com',
    value: 'metadrive-verification=token-123' });
  assert.equal(matchesDomainChallenge([['metadrive-verification=', 'token-123']], proof.value), true);
  assert.equal(matchesDomainChallenge([['metadrive-verification='], ['token-123']], proof.value), false);
  assert.equal(matchesDomainChallenge([['metadrive-verification=wrong']], proof.value), false);
});
test('MD-03.5: routing does not trust unverified or unknown host claims', () => {
  const tenants = { a: { domains: [{ hostname: 'a.example.com', status: 'PENDING' }] },
    b: { domains: [{ hostname: 'b.example.com', status: 'VERIFIED' }] } };
  assert.equal(verifiedHostTenant(tenants, 'a.example.com'), undefined);
  assert.equal(verifiedHostTenant(tenants, 'B.EXAMPLE.COM'), 'b');
  assert.equal(verifiedHostTenant(tenants, 'b.example.com.attacker.org'), undefined);
  assert.equal(reservedDomain('app.metadrive.example', new Set(['https://metadrive.example'])), true);
  assert.equal(reservedDomain('another.org', new Set(['https://metadrive.example'])), false);
});
