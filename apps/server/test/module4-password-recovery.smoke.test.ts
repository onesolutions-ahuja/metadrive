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

const require = createRequire(import.meta.url);
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = require.resolve('tsx/cli');
async function port(): Promise<number> {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No port');
  return await new Promise<number>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve(address.port)));
}
test('Module 4 email recovery requires tenant SMTP, preserves MFA and invalidates sessions', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metadrive-password-recovery-'));
  const apiPort = await port();
  const messages: string[] = [];
  const smtp = createServer((socket) => {
    socket.setEncoding('utf8');
    // The client can disconnect while the fake SMTP server is still replying.
    // Consume expected transport errors so a closed test socket cannot crash CI.
    socket.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE' && error.code !== 'ECONNRESET') {
        console.error('Unexpected mock SMTP socket error:', error);
      }
    });
    socket.write('220 localhost ESMTP MetaDrive test\r\n');
    let buffer = '', inData = false, body: string[] = [];
    socket.on('data', (part: string) => {
      buffer += part;
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n');
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        if (inData) {
          if (line === '.') {
            messages.push(body.join('\n')); body = []; inData = false; socket.write('250 Queued\r\n');
          } else body.push(line);
          continue;
        }
        if (/^(EHLO|HELO)/i.test(line)) socket.write('250-localhost\r\n250 SIZE 1000000\r\n');
        else if (/^DATA$/i.test(line)) { inData = true; socket.write('354 Send message\r\n'); }
        else if (/^QUIT$/i.test(line)) { socket.write('221 Bye\r\n'); socket.end(); }
        else socket.write('250 OK\r\n');
      }
    });
  });
  smtp.listen(0, '127.0.0.1');
  await once(smtp, 'listening');
  const address = smtp.address();
  assert.ok(address && typeof address !== 'string');
  const smtpPort = address.port;
  const email = 'admin@recovery-mail.test';
  const password = 'Recovery-Original-Password-2026!';
  const newPassword = 'Recovery-New-Strong-Password-2026!';
  let logs = '';
  const child = spawn(process.execPath, [cli, 'src/index.ts'], {
    cwd, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, PORT: String(apiPort), NODE_ENV: 'test', METADRIVE_TEST_MODE: 'true',
      METADRIVE_DATA_PATH: path.join(dir, 'state.json'),
      METADRIVE_BOOTSTRAP_TENANT_ID: 'email-recovery-test',
      METADRIVE_BOOTSTRAP_TENANT_NAME: 'Recovery Tenant',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL: email,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: password,
      METADRIVE_PROVISIONING_KEY: 'recovery-test-provision-key',
      METADRIVE_SMTP_TEST_MODE: 'true',
      METADRIVE_CREDENTIAL_KEYS: JSON.stringify({ 'test-key': Buffer.alloc(32, 7).toString('base64') }),
      METADRIVE_CREDENTIAL_ACTIVE_KEY_ID: 'test-key',
      METADRIVE_PASSWORD_RESET_BASE_URL: 'http://localhost:5173/',
      WEB_ORIGIN: 'http://localhost:5173'
    }
  });
  child.stdout?.on('data', (value: Buffer) => { logs += value.toString(); });
  child.stderr?.on('data', (value: Buffer) => { logs += value.toString(); });
  const api = async (route: string, token = '', method = 'GET', body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch('http://127.0.0.1:' + apiPort + '/api' + route, {
      method,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const raw = await response.text();
    return { status: response.status, data: raw ? JSON.parse(raw) as Record<string, any> : {} };
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 600; attempt++) {
      if (child.exitCode !== null) throw Error('Server failed: ' + logs);
      try {
        const response = await fetch('http://127.0.0.1:' + apiPort + '/health', { signal: AbortSignal.timeout(500) });
        if (response.ok) { ready = true; break; }
      } catch { /* starting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, logs);
    const login = await api('/auth/login', '', 'POST', { email, password });
    assert.equal(login.status, 200);
    const token = String(login.data.access_token);
    const untouched = await api('/auth/password-reset/request', '', 'POST', { email });
    assert.equal(untouched.status, 202);
    assert.equal(messages.length, 0, 'Recovery is off until configured by the tenant');

    const other = await api('/auth/provision-tenant', '', 'POST', {
      tenantId: 'second-recovery-test', tenantName: 'Second Recovery Tenant',
      adminName: 'Other', email: 'other@recovery-mail.test', password
    }, { 'x-provisioning-key': 'recovery-test-provision-key' });
    assert.equal(other.status, 201, JSON.stringify(other.data));
    const otherLogin = await api('/auth/login', '', 'POST', { email: 'other@recovery-mail.test', password });
    assert.equal(otherLogin.status, 200);
    const otherToken = String(otherLogin.data.access_token);

    const credential = await api('/named-credentials', token, 'POST', {
      name: 'Tenant_Recovery_SMTP',
      label: 'Recovery SMTP Test',
      protocol: 'SMTP', baseUrl: 'smtp://127.0.0.1:' + smtpPort,
      authType: 'None'
    });
    assert.equal(credential.status, 201, JSON.stringify(credential.data));
    const credentialId = credential.data.credential.id;
    assert.equal((await api('/auth/password-recovery/settings', otherToken, 'PUT', {
      smtpCredentialId: credentialId, fromEmail: 'help@recovery-mail.test'
    })).status, 400, 'Other tenant must not reference this SMTP credential');

    const settings = await api('/auth/password-recovery/settings', token, 'PUT', {
      smtpCredentialId: credentialId, fromEmail: 'help@recovery-mail.test',
      policy: { method:'LINK',defaultChannel:'email',allowedChannels:['email'] }
    });
    assert.equal(settings.status, 200, JSON.stringify(settings.data));
    assert.equal((await api('/auth/password-reset/request', '', 'POST', {
      email: 'missing@recovery-mail.test'
    })).status, 202);
    assert.equal(messages.length, 0, 'Unknown emails must not trigger delivery');

    const requested = await api('/auth/password-reset/request', '', 'POST', { email });
    assert.equal(requested.status, 202, JSON.stringify(requested.data));
    assert.equal(messages.length, 1, 'Password reset must be delivered to registered mailbox');
    // Nodemailer may emit quoted-printable MIME: '=' becomes '=3D' and long lines soft-wrap.
    const decodedMail = messages[0].replace(/=\n/g, '').replace(/=3D/gi, '=');
    // A reset email must direct the claimant only to an explicitly trusted front-end origin.
    // The email must never provide an attacker-selected target or point at the API host.
    const resetLinks = decodedMail.match(/https?:\/\/[^\s<>\"']+resetToken=[A-Za-z0-9_-]{64}/g) ?? [];
    assert.equal(resetLinks.length, 1, 'Exactly one trusted password-reset URL should be delivered');
    const resetLink = new URL(resetLinks[0].replace(/&amp;/g, '&'));
    assert.equal(resetLink.origin, 'http://localhost:5173');
    assert.equal(resetLink.protocol, 'http:', 'Only local test mode may use plain HTTP');
    assert.equal(resetLink.searchParams.has('resetToken'), true);
    const match = decodedMail.match(/resetToken=([A-Za-z0-9_-]{64})/);
    assert.ok(match, 'Delivered message must contain a single-use reset token');
    const resetToken = match[1];
    assert.equal((await api('/auth/password-reset/confirm', '', 'POST', {
      email: 'other@recovery-mail.test', token: resetToken, newPassword
    })).status, 400, 'Token cannot reset an account from another tenant');

    const reset = await api('/auth/password-reset/confirm', '', 'POST', {
      email, token: resetToken, newPassword
    });
    assert.equal(reset.status, 200, JSON.stringify(reset.data));
    assert.equal((await api('/auth/me', token)).status, 401, 'Access JWT revoked immediately');
    assert.equal((await api('/auth/me', otherToken)).status, 200, 'Other tenant unaffected');
    assert.equal((await api('/auth/password-reset/confirm', '', 'POST', {
      email, token: resetToken, newPassword: 'Another-Strong-Password-2026!'
    })).status, 400, 'Reset tokens must be single use');
    assert.equal((await api('/auth/login', '', 'POST', { email, password })).status, 401);
    const newLogin = await api('/auth/login', '', 'POST', { email, password: newPassword });
    assert.equal(newLogin.status, 200, JSON.stringify(newLogin.data));

    // Switch the same tenant to six-digit OTP without changing its SMTP credential.
    const otpSettings = await api('/auth/password-recovery/settings', String(newLogin.data.access_token), 'PUT', {
      smtpCredentialId: credentialId, fromEmail: 'help@recovery-mail.test',
      policy: { method:'OTP', defaultChannel:'email', allowedChannels:['email'],
        templates: {email:{subject:'{!Tenant.Name} code',body:'Code: {!Verification.Value} (expires {!Verification.ExpiryMinutes} minutes)'}} }
    });
    assert.equal(otpSettings.status, 200, JSON.stringify(otpSettings.data));
    const otpRequest = await api('/auth/password-reset/request', '', 'POST', { email });
    assert.equal(otpRequest.status, 202);
    assert.equal(messages.length, 2, 'OTP mail must be sent to configured tenant recipient');
    const otpMail = messages[1].replace(/=\n/g, '').replace(/=3D/gi, '=');
    const otpMatch = otpMail.match(/Code:\s*([0-9]{6})/);
    assert.ok(otpMatch, 'Email body must contain metadata-templated 6-digit code');
    assert.equal(otpMail.includes('resetToken='), false, 'OTP must not disclose a reset URL');
    const wrongOtp = otpMatch[1] === '000000' ? '000001' : '000000';
    assert.equal((await api('/auth/password-reset/confirm', '', 'POST', {
      email, token: wrongOtp, newPassword: 'Recovered-Again-2026!'
    })).status, 400, 'Wrong one-time codes must not change passwords');
    const otpCompleted = await api('/auth/password-reset/confirm', '', 'POST', {
      email, token: otpMatch[1], newPassword: 'Recovered-Again-2026!'
    });
    assert.equal(otpCompleted.status, 200, JSON.stringify(otpCompleted.data));
    assert.equal((await api('/auth/me', String(newLogin.data.access_token))).status, 401,
      'OTP password reset must revoke old sessions');
    assert.equal((await api('/auth/password-reset/confirm', '', 'POST', {
      email, token: otpMatch[1], newPassword: 'Replay-Rejected-2026!'
    })).status, 400, 'OTP must be single-use');
    const otpLogin = await api('/auth/login', '', 'POST', { email, password: 'Recovered-Again-2026!' });
    assert.equal(otpLogin.status, 200, JSON.stringify(otpLogin.data));

    const locked = await api('/auth/users/' + otpLogin.data.user.id + '/lock',
      String(otpLogin.data.access_token), 'POST', { durationMinutes: 60 });
    assert.equal(locked.status, 409, 'Security admins must not lock themselves out');
    assert.equal((await api('/auth/users/' + otherLogin.data.user.id + '/unlock',
      String(otpLogin.data.access_token), 'POST', {})).status, 404, 'Cross-tenant unlock rejected');
    const events = await api('/auth/security-events', String(otpLogin.data.access_token));
    assert.equal(events.status, 200);
    assert.ok(events.data.events.some((item: { action: string }) => item.action === 'auth.password-reset.completed'));
    assert.equal(JSON.stringify(events.data).includes(resetToken), false, 'Audit must never leak reset tokens');
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
