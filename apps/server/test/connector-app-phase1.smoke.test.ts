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
    const caps=await api(portNumber,'/connector-apps/capabilities',token);
    assert.equal(caps.status,200);
    assert.equal(caps.data.install,true);
    assert.equal(caps.data.test,true);
    assert.equal(caps.data.licence,false);
    const list=()=>api(portNumber,'/records/Connector_App__c?limit=50',token);
    const before=await list();
    assert.equal(before.status,200,JSON.stringify(before.data));
    const records=before.data.records as Array<Record<string,any>>;
    assert.equal(records.length,6);
    assert.ok(records.some(x=>x.AppKey__c==='kiosk'));
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
    const notOperator=await api(portNumber,'/connector-apps/xero/licence',token,{});
    assert.equal(notOperator.status,403,'Only an explicit platform licence operator can issue a paid term');
    const saved=await api(portNumber,'/named-credentials',token,{
      name:'XERO', label:'Xero Test', protocol:'HTTPS',
      baseUrl:'https://api.example.org/', authType:'Bearer', secret:'test-token-only-not-real'
    });
    assert.equal(saved.status,201,JSON.stringify(saved.data));
    assert.equal(saved.data.credential.enabled,false,'New managed credentials start disabled');
    assert.equal(saved.data.credential.hasSecret,true);
    // Edits with a blank secret retain the encrypted stored value rather than returning 400.
    const retainedSecret = await fetch('http://127.0.0.1:'+portNumber+'/api/named-credentials/'+saved.data.credential.id,{
      method:'PUT', headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({ name:'XERO',label:'Xero Renamed',protocol:'HTTPS',
        baseUrl:'https://api.example.org/',authType:'Bearer',secret:'' })
    });
    assert.equal(retainedSecret.status,200,await retainedSecret.text());
    const editedMetadata=(await api(portNumber,'/named-credentials',token)).data.credentials
      .find((item:Record<string,any>)=>item.id===saved.data.credential.id);
    assert.equal(editedMetadata.hasSecret,true,'Blank secret must preserve encrypted secret');

    assert.equal(JSON.stringify(saved.data).includes('test-token-only-not-real'),false,'Secrets must not leave the server');
    const testBlocked=await api(portNumber,'/named-credentials/'+saved.data.credential.id+'/test',token,{});
    assert.equal(testBlocked.status,409,'A disabled connection cannot be tested');
    const enabledResponse=await fetch('http://127.0.0.1:'+portNumber+'/api/connector-apps/xero/credential-enabled',{
      method:'PATCH',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({enabled:true})
    });
    assert.equal(enabledResponse.status,200);
    assert.equal((await enabledResponse.json()).credential.enabled,true);
    const uninstall=await run(app.UninstallFlow__c);
    assert.equal(uninstall.status,200,JSON.stringify(uninstall.data));
    const removed=(await list()).data.records.find((x:Record<string,any>)=>x.AppKey__c==='xero');
    assert.equal(removed.Installed__c,false);
    assert.equal(removed.TrialStartedAt__c,active.TrialStartedAt__c);
    const disabledAfterRemoval=await api(portNumber,'/named-credentials',token);
    assert.equal(disabledAfterRemoval.data.credentials.find((value:Record<string,any>)=>value.name==='XERO').enabled,false);
    const enableWhenUninstalled=await fetch('http://127.0.0.1:'+portNumber+'/api/connector-apps/xero/credential-enabled',{
      method:'PATCH',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({enabled:true})
    });
    assert.equal(enableWhenUninstalled.status,403);
    assert.equal((await run(app.InstallFlow__c)).status,200);
    const restored=(await list()).data.records.find((x:Record<string,any>)=>x.AppKey__c==='xero');
    assert.equal(restored.TrialStartedAt__c,active.TrialStartedAt__c);
    const preserved=await api(portNumber,'/named-credentials',token);
    const retainedCredential=preserved.data.credentials.find((value:Record<string,any>)=>value.name==='XERO');
    assert.equal(retainedCredential.enabled,false);
    assert.equal(retainedCredential.id,saved.data.credential.id,'Reinstall must preserve credential identity');
    assert.equal(retainedCredential.hasSecret,true,'Reinstall must preserve encrypted authentication configuration');
  } finally {
    await stop(child);
    await rm(dir,{recursive:true,force:true});
  }
});
