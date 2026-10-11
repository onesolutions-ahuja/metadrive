import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyConnectorLifecycle, connectorEntitlement, activeConnectorFlowReferences } from '../src/connector-app-runtime.js';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const user = 'admin@connector-phase1.test';
const password = 'Connector-Phase1-Validation-2026!';
const tenantId = 'connector-phase1-test';
async function port(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No available port');
  return await new Promise<number>((resolve, reject) => server.close((error) => error ? reject(error) : resolve(address.port)));
}
async function api(portNumber: number, route: string, token?: string, body?: unknown) {
  const response = await fetch('http://127.0.0.1:' + portNumber + '/api' + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? {'Content-Type':'application/json'} : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const raw = await response.text();
  return { status: response.status, data: raw ? JSON.parse(raw) as Record<string,any> : {} };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 4000))]);
}
test('connector licence and flow uninstall guard are enforced independently of UI', () => {
  const original = { Name: 'Example', CredentialName__c: 'EXAMPLE', Installed__c: true, TrialUsed__c: false, TrialRequested__c: false, TrialDays__c: 21 };
  const credentials = [{ id: 'cred-id', name: 'EXAMPLE' }];
  const now = new Date('2026-10-01T12:00:00.000Z');
  assert.equal(connectorEntitlement([original], credentials[0], now).allowed, false);
  const activated = applyConnectorLifecycle(original, { ...original, TrialRequested__c: true }, credentials, [], now);
  assert.equal(activated.TrialUsed__c, true);
  assert.equal(activated.TrialRequested__c, false);
  assert.equal(connectorEntitlement([activated], credentials[0], now).allowed, true);
  assert.equal(connectorEntitlement([activated], credentials[0], new Date('2026-11-01T12:00:00.000Z')).allowed, false);
  assert.throws(() => applyConnectorLifecycle(activated, { ...activated, TrialRequested__c: true }, credentials, [], now));
  const flows = [{ apiName: 'ONE_UsesApp', label: 'ONE Uses App', status: 'Active', elements: [{ type:'HTTP Callout', config: {namedCredentialId:'cred-id'} }] }];
  assert.deepEqual(activeConnectorFlowReferences(activated, credentials, flows), ['ONE Uses App']);
  assert.deepEqual(activeConnectorFlowReferences(activated, [], [{
    apiName: 'ONE_PendingCredential', label: 'Pending Credential Flow', status: 'Active',
    elements: [{ type: 'HTTP Callout', config: { namedCredentialId: 'EXAMPLE' } }]
  }]), ['Pending Credential Flow']);
  assert.throws(() => applyConnectorLifecycle(activated, { ...activated, Installed__c: false }, [], [{
    apiName: 'ONE_PendingCredential', label: 'Pending Credential Flow', status: 'Active',
    elements: [{ type: 'HTTP Callout', config: { namedCredentialId: 'EXAMPLE' } }]
  }], now), /Pending Credential Flow/);
  assert.throws(() => applyConnectorLifecycle(activated, { ...activated, Installed__c:false }, credentials, flows, now), /ONE Uses App/);
  const uninstalled = applyConnectorLifecycle(activated, { ...activated, Installed__c:false }, credentials, [], now);
  assert.equal(connectorEntitlement([uninstalled], credentials[0], now).allowed, false);
});
test('AppExchange installation and trial run using stored metadata flows', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metadrive-connector-phase1-'));
  const portNumber = await port();
  let logs = '';
  const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd,
    env: {
      ...process.env, PORT:String(portNumber), METADRIVE_DATA_PATH:path.join(dir,'state.json'),
      METADRIVE_CREDENTIAL_KEYS: JSON.stringify({test:Buffer.alloc(32,7).toString('base64')}),
      METADRIVE_CREDENTIAL_ACTIVE_KEY_ID:'test',
      METADRIVE_UNIFIED_CONNECTORS:'true',
      METADRIVE_BOOTSTRAP_TENANT_ID:tenantId,
      METADRIVE_BOOTSTRAP_TENANT_NAME:'Connector Phase1',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL:user,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:password
    },
    stdio:['ignore','pipe','pipe']
  });
  child.stdout?.on('data',(data:Buffer)=>{logs+=data.toString();});
  child.stderr?.on('data',(data:Buffer)=>{logs+=data.toString();});
  try {
    let ready=false;
    for (let i=0;i<600;i++){
      if (child.exitCode !== null) throw new Error('Server startup failed: '+logs);
      try {
        const health=await fetch('http://127.0.0.1:'+portNumber+'/health',{signal:AbortSignal.timeout(500)});
        if (health.ok){ready=true;break;}
      } catch { /* pending startup */ }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(ready,true,logs);
    const auth=await api(portNumber,'/auth/login',undefined,{email:user,password});
    assert.equal(auth.status,200,JSON.stringify(auth.data));
    const token=auth.data.access_token as string;
    const list=()=>api(portNumber,'/records/Connector_App__c?limit=50',token);
    const before=await list();
    assert.equal(before.status,200,JSON.stringify(before.data));
    const records=before.data.records as Array<Record<string,any>>;
    assert.equal(records.length,5);
    const app=records.find(x=>x.AppKey__c==='xero');
    assert.ok(app);
    assert.equal(app.Installed__c,false);
    const run=(name:string)=>api(portNumber,'/flows/'+encodeURIComponent(name)+'/execute',token,{AppKey:'xero'});
    const install=await run(app.InstallFlow__c);
    assert.equal(install.status,200,JSON.stringify(install.data));
    const installed=(await list()).data.records.find((x:Record<string,any>)=>x.AppKey__c==='xero');
    assert.equal(installed.Installed__c,true);
    assert.equal(installed.TrialUsed__c,false);
    const trial=await run(app.TrialFlow__c);
    assert.equal(trial.status,200,JSON.stringify(trial.data));
    const active=(await list()).data.records.find((x:Record<string,any>)=>x.AppKey__c==='xero');
    assert.equal(active.TrialUsed__c,true);
    assert.ok(Date.parse(active.TrialExpiresAt__c)>Date.parse(active.TrialStartedAt__c));
    const secondTrial=await run(app.TrialFlow__c);
    assert.ok(secondTrial.status>=400,'Trial must be one-time');
    const uninstall=await run(app.UninstallFlow__c);
    assert.equal(uninstall.status,200,JSON.stringify(uninstall.data));
    const removed=(await list()).data.records.find((x:Record<string,any>)=>x.AppKey__c==='xero');
    assert.equal(removed.Installed__c,false);
    assert.equal(removed.TrialStartedAt__c,active.TrialStartedAt__c);
    assert.equal((await run(app.InstallFlow__c)).status,200);
    const restored=(await list()).data.records.find((x:Record<string,any>)=>x.AppKey__c==='xero');
    assert.equal(restored.TrialStartedAt__c,active.TrialStartedAt__c);
  } finally {
    await stop(child);
    await rm(dir,{recursive:true,force:true});
  }
});
