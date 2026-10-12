import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { totpCode } from '../src/mfa.js';

const require = createRequire(import.meta.url);
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = require.resolve('tsx/cli');
async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No available port');
  return await new Promise<number>((resolve, reject) => server.close((error) => error ? reject(error) : resolve(address.port)));
}

test('tenant MFA can be Off, Optional or Required without a password-only API bypass', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metadrive-mfa-'));
  const port = await availablePort();
  const email = 'admin@mfa-smoke.test';
  const password = 'MFA-Smoke-Strong-Password-2026!';
  let logs = '';
  const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd,
    env: {
      ...process.env, NODE_ENV: 'test', PORT: String(port),
      METADRIVE_DATA_PATH: path.join(dir, 'state.json'),
      METADRIVE_BOOTSTRAP_TENANT_ID: 'tenant-mfa-test',
      METADRIVE_BOOTSTRAP_TENANT_NAME: 'MFA Test Tenant',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL: email,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: password,
      METADRIVE_CREDENTIAL_KEYS: JSON.stringify({ 'mfa-test': Buffer.alloc(32, 9).toString('base64') }),
      METADRIVE_CREDENTIAL_ACTIVE_KEY_ID: 'mfa-test',
      METADRIVE_PROVISIONING_KEY: 'mfa-provision-test-key'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout?.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
  child.stderr?.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
  const send = async (route: string, token = '', method = 'GET', body?: unknown, extra?: Record<string, string>) => {
    const response = await fetch('http://127.0.0.1:' + port + '/api' + route, {
      method,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...extra
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const raw = await response.text();
    return { status: response.status, data: raw ? JSON.parse(raw) as Record<string, any> : {} };
  };
  try {
    let ready = false;
    for (let i = 0; i < 600; i++) {
      if (child.exitCode !== null) throw Error('API exited: ' + logs);
      try {
        const health = await fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(500) });
        if (health.ok) { ready = true; break; }
      } catch { /* starting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, logs);
    const login = await send('/auth/login', '', 'POST', { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const firstToken = String(login.data.access_token);
    assert.deepEqual((await send('/auth/mfa/policy', firstToken)).data, { mode: 'Off' });

    const secondTenant = await send('/auth/provision-tenant', '', 'POST', {
      tenantId: 'tenant-mfa-2', tenantName: 'Second MFA Tenant', adminName: 'Another Admin',
      email: 'other@mfa-smoke.test', password
    }, { 'x-provisioning-key': 'mfa-provision-test-key' });
    assert.equal(secondTenant.status, 201, JSON.stringify(secondTenant.data));
    const secondLogin = await send('/auth/login', '', 'POST', { email: 'other@mfa-smoke.test', password });
    assert.equal(secondLogin.status, 200);

    const requireMfa = await send('/auth/mfa/policy', firstToken, 'PUT', { mode: 'Required' });
    assert.equal(requireMfa.status, 200, JSON.stringify(requireMfa.data));
    assert.deepEqual((await send('/auth/mfa/policy', String(secondLogin.data.access_token))).data, { mode: 'Off' },
      'Policy must be stored and read only inside the authenticated tenant');
    assert.equal((await send('/auth/me', firstToken)).status, 401,
      'Previously issued password-only bearer tokens cannot bypass newly required MFA');

    const challenge = await send('/auth/login', '', 'POST', { email, password });
    assert.equal(challenge.status, 202, JSON.stringify(challenge.data));
    assert.equal(challenge.data.mfa_required, true);
    assert.equal(challenge.data.enrollment_required, true);
    assert.equal((await send('/auth/me', String(challenge.data.challenge_token))).status, 401);
    assert.equal((await send('/auth/mfa/verify', '', 'POST', {
      challenge_token: challenge.data.challenge_token, code: 'not-six'
    })).status, 400);
    assert.equal((await send('/auth/mfa/verify', '', 'POST', {
      challenge_token: challenge.data.challenge_token, code: '000000'
    })).status, 401);

    const code = totpCode(String(challenge.data.setup_secret), Math.floor(Date.now() / 30_000));
    const verified = await send('/auth/mfa/verify', '', 'POST', {
      challenge_token: challenge.data.challenge_token, code
    });
    assert.equal(verified.status, 200, JSON.stringify(verified.data));
    const mfaToken = String(verified.data.access_token);
    assert.equal((await send('/auth/me', mfaToken)).status, 200);

    const optional = await send('/auth/mfa/policy', mfaToken, 'PUT', { mode: 'Optional' });
    assert.equal(optional.status, 200);
    const enrolledLogin = await send('/auth/login', '', 'POST', { email, password });
    assert.equal(enrolledLogin.status, 202, 'Optional MFA still challenges enrolled users');

    const off = await send('/auth/mfa/policy', mfaToken, 'PUT', { mode: 'Off' });
    assert.equal(off.status, 200);
    assert.equal((await send('/auth/login', '', 'POST', { email, password })).status, 200,
      'Password-only login remains allowed when the tenant disables MFA');
    assert.deepEqual((await send('/auth/mfa/policy', String(secondLogin.data.access_token))).data, { mode: 'Off' });
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 4000))]);
    }
    await rm(dir, { recursive: true, force: true });
  }
});
