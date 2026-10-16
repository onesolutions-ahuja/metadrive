import assert from 'node:assert/strict';
import test from 'node:test';
import { executeConnectorTest } from '../src/connector-test.js';

const definition = {
  authType: 'BEARER' as const,
  baseUrl: 'https://graph.facebook.com/v22.0',
  credentialsSchema: [{ name: 'access_token', required: true, secret: true }],
  test: { method: 'GET' as const, path: '/{phone_number_id}?fields=id', expectedStatus: 200 },
  timeoutMs: 30000
};

test('without test metadata returns unavailable without network access', async () => {
  const { test: _test, ...withoutTest } = definition;
  const result = await executeConnectorTest(withoutTest, {}, {}, async () => { throw new Error('Should not call'); });
  assert.equal(result.status, 'Test unavailable');
});

test('missing credentials do not trigger requests', async () => {
  const result = await executeConnectorTest(definition, { phone_number_id: '123' }, {}, async () => { throw new Error('Should not call'); });
  assert.equal(result.status, 'Not configured');
});

test('bearer test sends a safe read-only request', async () => {
  let called = false;
  const result = await executeConnectorTest(definition, { phone_number_id: '123' }, { access_token: 'test-token' }, async (url, method, headers) => {
    called = true;
    assert.equal(method, 'GET');
    assert.equal(url.toString(), 'https://graph.facebook.com/v22.0/123?fields=id');
    assert.equal(headers.authorization, 'Bearer test-token');
    return { status: 200, body: { id: '123' }, headers: {} };
  });
  assert.equal(called, true);
  assert.equal(result.status, 'Connected');
});

test('unexpected response status fails without exposing credentials', async () => {
  const result = await executeConnectorTest(definition, { phone_number_id: '123' }, { access_token: 'sensitive-token' }, async () =>
    ({ status: 401, body: { error: 'sensitive-token' }, headers: {} }));
  assert.equal(result.status, 'Failed');
  assert.equal(result.message.includes('sensitive-token'), false);
});
