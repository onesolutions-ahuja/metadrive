import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function port(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Port unavailable');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

test('one WhatsApp number can switch legal and beauty context without extra messages', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metadrive-whatsapp-context-'));
  const chosenPort = await port();
  const email = 'admin@context-test.example';
  const password = 'ContextSmokePassword_2026!';
  let child: ChildProcess | undefined;
  try {
    child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
      cwd: serverDirectory,
      env: {
        ...process.env, PORT: String(chosenPort), METADRIVE_DATA_PATH: path.join(dir, 'state.json'),
        METADRIVE_BOOTSTRAP_TENANT_ID: 'context-test',
        METADRIVE_BOOTSTRAP_TENANT_NAME: 'Context test',
        METADRIVE_BOOTSTRAP_ADMIN_EMAIL: email,
        METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: password,
        METADRIVE_CREDENTIAL_KEYS: JSON.stringify({ 'test-key': Buffer.alloc(32, 11).toString('base64') }),
        METADRIVE_CREDENTIAL_ACTIVE_KEY_ID: 'test-key'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let logs = '';
    child.stdout?.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
    const root = `http://127.0.0.1:${chosenPort}`;
    let ready = false;
    for (let i = 0; i < 400; i += 1) {
      if (child.exitCode !== null) throw Error('Test server crashed: ' + logs);
      try {
        const health = await fetch(root + '/health', { signal: AbortSignal.timeout(500) });
        if (health.ok) { ready = true; break; }
      } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, 'Test server must start');
    const send = async (uri: string, method: string, token?: string, body?: unknown) => {
      const response = await fetch(root + '/api' + uri, {
        method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const result = await response.json() as Record<string, any>;
      return { status: response.status, result };
    };
    const login = await send('/auth/login', 'POST', undefined, { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.result));
    const token = login.result.access_token as string;
    const contextFlow = await send('/metadata/flows/WA_CONTEXT', 'GET', token);
    assert.equal(contextFlow.status, 200, JSON.stringify(contextFlow.result));
    assert.equal(contextFlow.result.flow.status, 'Active');
    const common = { Event_Type__c: 'Message', Communication_Mode__c: 'WhatsApp', Source__c: 'Webhook',
      Direction__c: 'Incoming', From_Number__c: '447000000001' };
    for (const [message, expected] of [['LAWYER', 'Legal'], ['BEAUTY', 'Beauty'], ['BARBER', 'Beauty'], ['LAWYER', 'Legal']] as const) {
      const created = await send('/records/Communication_Records__c', 'POST', token, {
        ...common, Message_Body__c: message
      });
      assert.equal(created.status, 201, JSON.stringify(created.result));
      assert.equal(created.result.record.Conversation_Context__c, expected, JSON.stringify(created.result));
    }
    const audit = await send('/records/Communication_Records__c', 'POST', token, {
      Event_Type__c: 'API Call', Communication_Mode__c: 'API', Source__c: 'API',
      Direction__c: 'Incoming', From_Number__c: '447000000001'
    });
    assert.equal(audit.status, 201, JSON.stringify(audit.result));
    assert.equal(audit.result.record.Conversation_Context__c ?? '', '');
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 5_000))]);
    }
    await rm(dir, { recursive: true, force: true });
  }
});
