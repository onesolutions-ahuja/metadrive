// Module 9 Flow input mapping: isolated real browser authoring/persistence/runtime proof.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const tmp = mkdtempSync(join(tmpdir(), 'md09-flow-input-'));
const login = { email: 'flow-binding-qa@example.test', password: 'Synthetic-Flow-Inputs-2026!' };
const children = [];
let browser;
const api = 'http://127.0.0.1:3001/api';
const base = 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function service(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(), env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => { logs = (logs + String(chunk)).slice(-7500); });
  }
  children.push(child);
  return { child, logs: () => logs };
}
async function ready(url, info) {
  for (let i = 0; i < 140; i++) {
    if (info.child.exitCode !== null) throw Error('Service exited: ' + info.logs());
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(700) });
      if (response.ok) return;
      if (response.status >= 500) throw Error('Service error ' + response.status + ' ' + info.logs());
    } catch (error) {
      if (String(error).includes('Service error')) throw error;
    }
    await sleep(250);
  }
  throw Error('Service not ready: ' + url + ' ' + info.logs());
}
async function request(path, token, method = 'GET', payload) {
  const response = await fetch(api + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw Error(method + ' ' + path + ': ' + response.status + ' ' + JSON.stringify(data).slice(0, 1100));
  return data;
}
try {
  const server = service(['apps/server/dist/index.js'], {
    DATABASE_URL: '', NODE_ENV: 'test', METADRIVE_TEST_MODE: 'true',
    METADRIVE_DATA_PATH: join(tmp, 'data.json'),
    METADRIVE_BOOTSTRAP_TENANT_ID: 'md09-input-tenant',
    METADRIVE_BOOTSTRAP_TENANT_NAME: 'MD09 Input Testing',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL: login.email,
    METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: login.password,
    METADRIVE_SCHEDULE_POLL_MS: '3600000', PORT: '3001', WEB_ORIGIN: base
  });
  const web = service(['node_modules/vite/bin/vite.js', 'apps/web', '--host', '127.0.0.1', '--port', '5173'], {
    VITE_API_BASE_URL: api
  });
  await Promise.all([ready('http://127.0.0.1:3001/health', server), ready(base, web)]);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(25000);
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(base+'/une/login');
  await page.locator('#login-email').fill(login.email);
  await page.locator('#login-password').fill(login.password);
  await page.locator('button.auth-submit').click();
  await page.locator('.auth-screen').waitFor({ state: 'hidden' });

  await page.goto(base + '/une/setup/component-library');
  await page.getByRole('heading', { name: 'Global Component Library' }).waitFor();
  await page.getByRole('button', { name: 'Register component' }).click();
  await page.locator('#library-component-label').fill('MD09 Flow Button');
  await page.locator('#library-jsx-file').setInputFiles({
    name: 'MD09_Flow_Button.jsx', mimeType: 'text/javascript',
    buffer: Buffer.from(
      "export default function Component({label,onAction}){return <button onClick={() => onAction({event:'submit',value:{item:{id:'ABC'},quantity:3}})}>Submit mapped Flow</button>}"
    )
  });
  await page.getByRole('button', { name: 'Register draft' }).click();
  const card = page.locator('.library-component-card').filter({ hasText: 'MD09_Flow_Button' });
  await card.getByText('Draft', { exact: false }).first().waitFor();
  await card.getByRole('button', { name: 'Publish' }).click();
  await card.getByText('Published', { exact: false }).first().waitFor();

  const token = (await request('/auth/login', undefined, 'POST', login)).access_token;
  const flowApiName = 'MD09_Input_Flow', pageApiName = 'MD09_Input_Page', appId = 'MD09_Input_App';
  const resource = (name, dataType = 'Text') => ({
    name, label: name, type: 'Variable', dataType, isCollection: false,
    availableForInput: true, availableForOutput: false
  });
  await request('/metadata/flows/' + flowApiName, token, 'PUT', {
    apiName: flowApiName, label: 'MD09 Input Flow', flowType: 'Autolaunched Flow',
    status: 'Active', versionNumber: 1, activeVersion: null,
    triggerObject: null, startConfig: {},
    elements: [{ id: 1, type: 'Start', label: 'Start', config: {} }],
    connectors: [],
    resources: [resource('ItemId'), resource('Quantity', 'Number'), resource('SessionId'), resource('Confirmed', 'Boolean')],
    versions: []
  });
  await request('/metadata/pages/' + pageApiName, token, 'PUT', {
    apiName: pageApiName, label: 'MD09 Input Page',
    targetObject: 'Account', pageType: 'App Page', status: 'Active',
    layoutMode: 'template', template: 'one-region', canvasWidth: 1440, canvasHeight: 900,
    devices: ['Desktop', 'Phone'], activationAssignments: [],
    components: [{
      id: 'mapped-button', type: 'Custom:MD09_Flow_Button', label: 'MD09 Flow Button',
      properties: {
        libraryComponentId: 'MD09_Flow_Button', objectApiName: 'Account',
        actionFlows: { submit: { actionType: 'Flow', flowApiName, inputs: {} } }
      },
      visible: true, region: 'main'
    }]
  });
  await request('/metadata/apps', token, 'POST', {
    apiName: appId, label: 'MD09 Input App', description: 'Disposable Flow action acceptance',
    navigationItems: ['Account'], navigationPageApiNames: [pageApiName],
    brandColor: '#0176d3', utilityItems: []
  });

  await page.goto(base + '/une/setup/page-builder/' + pageApiName);
  await page.getByRole('button', { name: 'Desktop preview' }).waitFor();
  await page.getByRole('tab', { name: 'Data & Actions' }).first().click();
  const mapping = page.getByLabel('Flow input mapping').first();
  await mapping.waitFor();
  for (const name of ['ItemId', 'Quantity', 'SessionId', 'Confirmed']) {
    await mapping.locator('[data-flow-input="' + name + '"]').waitFor();
  }
  await mapping.getByLabel('ItemId source').selectOption('Event Field');
  await mapping.getByLabel('ItemId event property').fill('item.id');
  await mapping.getByLabel('Quantity source').selectOption('Event Field');
  await mapping.getByLabel('Quantity event property').fill('quantity');
  await mapping.getByLabel('SessionId source').selectOption('Session');
  await mapping.getByLabel('Confirmed source').selectOption('Literal');
  await mapping.getByLabel('Confirmed fixed value').selectOption('true');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const storedPage = (await request('/metadata/pages', token)).pages.find(item => item.apiName === pageApiName);
  assert(storedPage);
  assert.deepEqual(storedPage.components[0].properties.actionFlows.submit.inputs, {
    ItemId: '$event.item.id', Quantity: '$event.quantity',
    SessionId: '$session', Confirmed: true
  });

  await page.reload();
  await page.getByRole('button', { name: 'Desktop preview' }).waitFor();
  await page.getByRole('tab', { name: 'Data & Actions' }).first().click();
  const restored = page.getByLabel('Flow input mapping').first();
  assert.equal(await restored.getByLabel('ItemId source').inputValue(), 'Event Field');
  assert.equal(await restored.getByLabel('ItemId event property').inputValue(), 'item.id');
  assert.equal(await restored.getByLabel('Confirmed source').inputValue(), 'Literal');

  // Runtime transport must evaluate selected metadata sources, not send raw expressions.
  await page.goto(base + '/une/apps/' + appId + '/pages/' + pageApiName);
  const frame = page.locator('iframe[sandbox="allow-scripts"]').first();
  await frame.waitFor({ state: 'attached' });
  const sent = page.waitForRequest(req => req.method() === 'POST'
    && req.url().includes('/flows/' + flowApiName + '/execute'));
  await frame.contentFrame().getByRole('button', { name: 'Submit mapped Flow' }).click();
  const payload = (await sent).postDataJSON();
  assert.equal(payload.ItemId, 'ABC');
  assert.equal(payload.Quantity, 3);
  assert.equal(payload.Confirmed, true);
  assert.equal(typeof payload.SessionId, 'string');
  assert(payload.SessionId.length > 8);
  assert.deepEqual(errors, []);
  console.log('MD09 input binding E2E passed: visual selectors, persistence, reload and runtime evaluation.');
} finally {
  if (browser) await browser.close();
  for (const child of children.reverse()) if (child.exitCode === null) child.kill('SIGTERM');
  rmSync(tmp, { recursive: true, force: true });
}
