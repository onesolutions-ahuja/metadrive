import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { tenantForRequest, tenantHostConfig, mappedTenantOrigin } from '../src/tenant-host-routing.js';

const mappings = JSON.stringify({ 'shop-a.example.com': 'tenant-a', 'shop-b.example.com': 'tenant-b' });
const routes = tenantHostConfig(mappings, 'api.example.com');
test('MD-01B routing: exact host/Origin mappings, deny mismatches and spoofing', () => {
  assert.deepEqual(tenantForRequest(routes, 'shop-a.example.com:443', undefined),
    { allowed: true, tenantId: 'tenant-a' });
  assert.deepEqual(tenantForRequest(routes, 'api.example.com', 'https://shop-b.example.com'),
    { allowed: true, tenantId: 'tenant-b' });
  assert.deepEqual(tenantForRequest(routes, 'shop-a.example.com', 'https://shop-b.example.com'),
    { allowed: false, tenantId: null });
  assert.deepEqual(tenantForRequest(routes, 'shop-a.example.com.evil.com', undefined),
    { allowed: false, tenantId: null });
  assert.deepEqual(tenantForRequest(routes, 'unknown.example.com', undefined),
    { allowed: false, tenantId: null });
  assert.deepEqual(tenantForRequest(routes, 'api.example.com', undefined),
    { allowed: true, tenantId: null });
  assert.equal(mappedTenantOrigin(routes, 'https://shop-a.example.com'), true);
  assert.equal(mappedTenantOrigin(routes, 'http://shop-a.example.com'), false);
  assert.equal(mappedTenantOrigin(routes, 'https://shop-a.example.com.evil.com'), false);
  assert.equal(tenantHostConfig(undefined, undefined).enabled, false, 'Legacy development remains compatible');
  assert.throws(() => tenantHostConfig('{"api.example.com":"wrong"}', 'api.example.com'));
  assert.throws(() => tenantHostConfig('{"shop-a.example.com":"a","SHOP-A.EXAMPLE.COM":"b"}', undefined));
  assert.throws(() => tenantHostConfig('not-json', undefined));
});

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function port(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Unavailable port');
  return await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve(address.port)));
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 4000))]);
}
test('MD-01B API: login, bearer requests and refresh cannot cross tenant hostnames', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metadrive-tenant-host-'));
  const serverPort = await port();
  let logs = '';
  const password = 'Metadrive-Tenant-Host-Validation-2026!';
  const provisionKey = 'Metadrive-Test-Provision-Key-2026';
  const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd,
    env: {
      ...process.env, PORT: String(serverPort),
      NODE_ENV: 'test', METADRIVE_TEST_MODE: 'true',
      METADRIVE_DATA_PATH: path.join(dir, 'state.json'),
      METADRIVE_TENANT_HOSTS: mappings,
      METADRIVE_SHARED_API_HOSTS: 'api.example.com',
      METADRIVE_PROVISIONING_KEY: provisionKey,
      METADRIVE_BOOTSTRAP_TENANT_ID: 'tenant-a',
      METADRIVE_BOOTSTRAP_TENANT_NAME: 'Shop A',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL: 'admin-a@tenant-host.test',
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: password
    }, stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout?.on('data', (data: Buffer) => { logs += data.toString(); });
  child.stderr?.on('data', (data: Buffer) => { logs += data.toString(); });
  const api = async (route: string, opts: {
    host?: string; origin?: string; token?: string; method?: string; body?: unknown;
    cookie?: string; forwardedHost?: string;
  } = {}) => {
    // Node's fetch/undici drops custom Host headers. Use http.request to
    // exercise the actual Host received by Express behind a reverse proxy.
    return await new Promise<{ status: number; data: Record<string, any>; cookie: string }>((resolve, reject) => {
      const request = httpRequest('http://127.0.0.1:' + serverPort + '/api' + route, {
        method: opts.method ?? 'GET',
        headers: {
          Host: opts.host ?? 'api.example.com',
          ...(opts.origin ? { Origin: opts.origin } : {}),
          ...(opts.token ? { Authorization: 'Bearer ' + opts.token } : {}),
          ...(opts.cookie ? { Cookie: opts.cookie } : {}),
          ...(opts.forwardedHost ? { 'X-Forwarded-Host': opts.forwardedHost } : {}),
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {})
        }
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            resolve({ status: response.statusCode ?? 0, data: raw ? JSON.parse(raw) as Record<string, any> : {},
              cookie: response.headers['set-cookie']?.[0] ?? '' });
          } catch (error) { reject(error); }
        });
        response.on('error', reject);
      });
      request.on('error', reject);
      request.end(opts.body === undefined ? undefined : JSON.stringify(opts.body));
    });
  };
  try {
    let ready = false;
    for (let i = 0; i < 300; i++) {
      if (child.exitCode !== null) throw Error('Server exited: ' + logs);
      try {
        const res = await fetch('http://127.0.0.1:' + serverPort + '/health', { signal: AbortSignal.timeout(500) });
        if (res.ok) { ready = true; break; }
      } catch { /* starting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, logs);
    const provision = await fetch('http://127.0.0.1:' + serverPort + '/api/auth/provision-tenant', {
      method: 'POST', headers: { 'x-provisioning-key': provisionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: 'tenant-b', tenantName: 'Shop B', adminName: 'Admin B',
        email: 'admin-b@tenant-host.test', password
      })
    });
    assert.equal(provision.status, 201, await provision.text());
    const loginA = await api('/auth/login', { host: 'shop-a.example.com',
      method: 'POST', body: { email: 'admin-a@tenant-host.test', password } });
    assert.equal(loginA.status, 200, JSON.stringify(loginA.data));
    const tokenA = String(loginA.data.access_token);
    const cookieA = loginA.cookie.split(';')[0];
    assert.equal((await api('/auth/me', { host: 'shop-a.example.com', token: tokenA })).status, 200);
    assert.equal((await api('/auth/me', { host: 'shop-b.example.com', token: tokenA })).status, 403);
    assert.equal((await api('/auth/me', { host: 'shop-b.example.com', token: tokenA,
      forwardedHost: 'shop-a.example.com' })).status, 403);
    assert.equal((await api('/auth/me', { host: 'evil.example.com', token: tokenA })).status, 403);
    assert.equal((await api('/auth/login', { host: 'shop-b.example.com', method: 'POST',
      body: { email: 'admin-a@tenant-host.test', password } })).status, 403);
    assert.equal((await api('/auth/refresh', { host: 'shop-b.example.com', method: 'POST',
      cookie: cookieA })).status, 403);
    assert.equal((await api('/auth/me', { host: 'api.example.com', origin: 'https://shop-b.example.com',
      token: tokenA })).status, 403);
    assert.equal((await api('/auth/me', { host: 'api.example.com', origin: 'https://shop-a.example.com',
      token: tokenA })).status, 200);
    const loginB = await api('/auth/login', { host: 'api.example.com', origin: 'https://shop-b.example.com',
      method: 'POST', body: { email: 'admin-b@tenant-host.test', password } });
    assert.equal(loginB.status, 200, JSON.stringify(loginB.data));
    assert.equal((await api('/auth/me', { host: 'shop-a.example.com',
      token: String(loginB.data.access_token) })).status, 403);
  } finally {
    await stop(child);
    await rm(dir, { recursive: true, force: true });
  }
});
