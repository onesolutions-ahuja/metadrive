import assert from 'node:assert/strict';

const origin = process.env.METADRIVE_E2E_BASE_URL;
if (!origin) {
  console.error('METADRIVE_E2E_BASE_URL is required. Refusing to imply a real environment was tested.');
  process.exitCode = 2;
} else {
  const base = new URL(origin);
  assert.ok(['https:', 'http:'].includes(base.protocol));
  if (base.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(base.hostname)) {
    throw new Error('Remote foundation smoke verification requires HTTPS.');
  }
  const get = async (path) => {
    const response = await fetch(new URL(path, base), { redirect: 'manual', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    return { response, body: await response.text() };
  };
  const config = await get('/api/auth/config');
  assert.equal(config.response.status, 200, '/api/auth/config must return 200');
  const parsed = JSON.parse(config.body);
  assert.ok(['local','oidc'].includes(parsed.mode), 'unexpected authentication mode');
  assert.ok(parsed.issuer && parsed.audience, 'issuer and audience must be configured');
  const discovery = await get('/.well-known/openid-configuration');
  assert.equal(discovery.response.status, 200, 'OIDC discovery must return 200');
  const metadata = JSON.parse(discovery.body);
  assert.ok(metadata.issuer && metadata.jwks_uri, 'OIDC discovery incomplete');
  const jwksUrl = new URL(metadata.jwks_uri);
  assert.equal(jwksUrl.origin, base.origin, 'unexpected JWKS origin; configure explicit public authority as needed');
  const jwks = await get(jwksUrl.pathname);
  assert.equal(jwks.response.status, 200, 'JWKS must be accessible');
  assert.ok(Array.isArray(JSON.parse(jwks.body).keys), 'JWKS must contain keys array');
  const protectedResource = await get('/api/metadata/objects');
  assert.ok([401,403,404].includes(protectedResource.response.status), 'unauthed metadata request must not expose tenant data');
  console.log('PASS: auth config, OIDC discovery, JWKS, unauthenticated metadata denial');
  console.log('NOTE: this unauthenticated smoke test does not prove login, database writes, tenant separation or durable workflows.');
}
