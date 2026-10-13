// Module 9 isolated, real Chromium acceptance: metadata-defined App Page navigation.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const temp = mkdtempSync(join(tmpdir(), 'md09-route-'));
const user = { email: 'qa-routing@example.test', password: 'Synthetic-Route-QA-2026!' };
const children = [];
let browser;
const api = 'http://127.0.0.1:3001/api';
const site = 'http://127.0.0.1:5173';

function service(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => { logs = (logs + String(chunk)).slice(-5000); });
  }
  const info = { child, logs: () => logs };
  children.push(info);
  return info;
}

async function ready(url, info) {
  for (let i = 0; i < 140; i += 1) {
    if (info.child.exitCode !== null) throw new Error('Service exited: ' + info.logs());
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(700) });
      if (response.ok) return;
      if (response.status >= 500) throw new Error('Server error ' + response.status + ' ' + info.logs());
    } catch (error) {
      if (String(error).includes('Server error')) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Service did not start: ' + url + ' ' + info.logs());
}

async function request(path, token, method = 'GET', body) {
  const response = await fetch(api + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(method + ' ' + path + ': ' + response.status + ' ' + JSON.stringify(data).slice(0, 900));
  return data;
}

try {
  const server = service(['apps/server/dist/index.js'], {
    DATABASE_URL: '', NODE_ENV: 'test', METADRIVE_TEST_MODE: 'true',
    METADRIVE_DATA_PATH: join(temp, 'state.json'),
    METADRIVE_BOOTSTRAP_TENANT_ID: 'md09-route-browser',
    METADRIVE_BOOTSTRAP_TENANT_NAME: 'Module Nine Route QA',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL: user.email,
    METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: user.password,
    METADRIVE_SCHEDULE_POLL_MS: '3600000',
    PORT: '3001', WEB_ORIGIN: site
  });
  const web = service(['node_modules/vite/bin/vite.js', 'apps/web', '--host', '127.0.0.1', '--port', '5173'], {
    VITE_API_BASE_URL: api
  });
  await Promise.all([ready('http://127.0.0.1:3001/health', server), ready(site, web)]);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(25000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(site);
  await page.locator('#login-email').fill(user.email);
  await page.locator('#login-password').fill(user.password);
  await page.locator('button.auth-submit').click();
  await page.locator('.auth-screen').waitFor({ state: 'hidden' });

  // A disposable custom JSX button emits the generic 'browse' event.
  await page.goto(site + '/une/setup/component-library');
  await page.getByRole('heading', { name: 'Global Component Library' }).waitFor();
  await page.getByRole('button', { name: 'Register component' }).click();
  await page.locator('#library-component-label').fill('MD09 Route Button');
  await page.locator('#library-jsx-file').setInputFiles({
    name: 'MD09_Route_Button.jsx',
    mimeType: 'text/javascript',
    buffer: Buffer.from(
      "export default function Component({label,onAction}) { return <div><span>{label}</span><button onClick={() => onAction({event:'browse',value:{}})}>Go to destination</button></div> }"
    )
  });
  await page.getByRole('button', { name: 'Register draft' }).click();
  const widget = page.locator('.library-component-card').filter({ hasText: 'MD09_Route_Button' });
  await widget.getByText('Draft', { exact: false }).first().waitFor();
  await widget.getByRole('button', { name: 'Publish' }).click();
  await widget.getByText('Published', { exact: false }).first().waitFor();

  const token = (await request('/auth/login', undefined, 'POST', user)).access_token;
  const registry = await request('/component-library', token);
  assert(registry.components.some((component) =>
    component.apiName === 'MD09_Route_Button' && component.status === 'Published'
    && component.surfaces.includes('page')));

  const appId = 'MD09_Test_App';
  const sourceId = 'MD09_Route_Source';
  const targetId = 'MD09_Route_Target';
  const common = {
    targetObject: 'Account', pageType: 'App Page', status: 'Active',
    layoutMode: 'template', template: 'one-region', canvasWidth: 1440,
    canvasHeight: 900, devices: ['Desktop', 'Phone'], activationAssignments: []
  };
  await request('/metadata/pages/' + targetId, token, 'PUT', {
    ...common, apiName: targetId, label: 'MD09 Destination', components: []
  });
  await request('/metadata/pages/' + sourceId, token, 'PUT', {
    ...common, apiName: sourceId, label: 'MD09 Source',
    components: [{
      id: 'route-button', type: 'Custom:MD09_Route_Button', label: 'Route button',
      properties: {
        libraryComponentId: 'MD09_Route_Button', objectApiName: 'Account',
        actionFlows: {
          browse: {
            actionType: 'Navigate', navigationTargetType: 'App Page',
            navigationAppId: appId, navigationPageApiName: targetId
          }
        }
      },
      visible: true, region: 'main'
    }]
  });
  await request('/metadata/apps', token, 'POST', {
    apiName: appId, label: 'MD09 Route App', description: 'Temporary routing acceptance application',
    navigationItems: ['Account'], navigationPageApiNames: [sourceId, targetId],
    brandColor: '#0176d3', utilityItems: []
  });

  // Verify Page Builder offers typed destinations and the computed safe route.
  await page.goto(site + '/une/setup/page-builder/' + sourceId);
  await page.getByRole('button', { name: 'Desktop preview' }).waitFor();
  await page.getByRole('tab', { name: 'Data & Actions' }).click();
  const inspector = page.locator('.metadata-navigation-target').first();
  await inspector.waitFor();
  assert.equal(await inspector.locator('select').nth(0).inputValue(), 'App Page');
  assert.equal(await inspector.locator('select').nth(1).inputValue(), appId);
  assert.equal(await inspector.locator('select').nth(2).inputValue(), targetId);
  const destination = '/une/apps/' + appId + '/pages/' + targetId;
  assert.equal(await inspector.locator('a[href]').first().getAttribute('href'), destination);
  // Routes are generated from active App/Page/Object metadata.
  await page.getByRole('button', { name: 'Open page routes' }).click();
  const directory = page.getByRole('dialog', { name: 'Page routes' });
  await directory.waitFor();
  await directory.getByLabel('Filter routes by application').selectOption(appId);
  const targetRow = directory.locator('[data-route-key="' + appId + ':page:' + targetId + '"]');
  await targetRow.waitFor();
  assert.equal(await targetRow.locator('a[href]').first().getAttribute('href'), destination);
  const recordRow = directory.locator('[data-route-key="' + appId + ':object:Account"]');
  await recordRow.waitFor();
  assert.match(await recordRow.locator('code').innerText(), /\/une\/o\/Account\/list\?/);
  await directory.getByLabel('Search routes').fill(targetId);
  assert.equal(await directory.getByRole('table', { name: 'Page route directory' }).locator('tbody tr').count(), 1);
  await directory.getByRole('button', { name: 'Close page routes' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const saved = (await request('/metadata/pages', token)).pages.find((item) => item.apiName === sourceId);
  assert.equal(saved.components[0].properties.actionFlows.browse.navigationPageApiName, targetId);
  await page.reload();
  await page.getByRole('button', { name: 'Desktop preview' }).waitFor();
  await page.getByRole('tab', { name: 'Data & Actions' }).click();
  const reopened = page.locator('.metadata-navigation-target').first();
  await reopened.waitFor();
  assert.equal(await reopened.locator('select').nth(0).inputValue(), 'App Page');
  assert.equal(await reopened.locator('select').nth(2).inputValue(), targetId);

  // Click the actual registered component across both route form factors.
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto(site + '/une/apps/' + appId + '/pages/' + sourceId);
    const frame = page.locator('iframe[sandbox="allow-scripts"]').first();
    await frame.waitFor({ state: 'attached' });
    await frame.contentFrame().getByRole('button', { name: 'Go to destination' }).click();
    await page.waitForURL('**/une/apps/' + appId + '/pages/' + targetId);
    await page.locator('[data-lightning-page="' + targetId + '"]').waitFor();
  }
  assert.deepEqual(pageErrors, []);
  console.log('MD-09 browser acceptance passed: editor, save/reopen, desktop and phone runtime routes.');
} finally {
  if (browser) await browser.close();
  for (const info of children) {
    if (info.child.exitCode === null) info.child.kill('SIGTERM');
  }
  rmSync(temp, { recursive: true, force: true });
}
