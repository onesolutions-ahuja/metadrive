import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { SqlPersistence } from '../../src/system-files/sql-persistence.js';
import { createSystemServer } from '../../src/system-support/server.js';

test('registered tenant origin can preflight record updates with concurrency headers', async () => {
  const db = {
    query: async (sql: string, params: unknown[]) => {
      assert.match(sql, /FROM md_tenant_domains/);
      assert.deepEqual(params, ['tenant.example']);
      return { rows: [{ tenant_id: 'tenant-a' }] };
    }
  } as unknown as SqlPersistence;
  const server = createSystemServer(db).listen(0, '127.0.0.1');
  try {
    if (!server.listening) await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/objects/Product__c/fields/ImageUrl`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://tenant.example',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'content-type,if-match,if-unmodified-since,x-metadrive-offline-sync,authorization'
      }
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://tenant.example');
    const allowed = response.headers.get('access-control-allow-headers')?.toLowerCase().split(',').map(value => value.trim()) ?? [];
    assert.ok(allowed.includes('if-match'));
    assert.ok(allowed.includes('if-unmodified-since'));
    assert.ok(allowed.includes('x-metadrive-offline-sync'));
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('unregistered origin cannot preflight If-Match requests', async () => {
  const db = { query: async () => ({ rows: [] }) } as unknown as SqlPersistence;
  const server = createSystemServer(db).listen(0, '127.0.0.1');
  try {
    if (!server.listening) await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/objects/Product__c/fields/ImageUrl`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://unregistered.example', 'Access-Control-Request-Headers': 'if-match' }
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
