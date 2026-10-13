import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const apiBase = 'http://127.0.0.1:3001/api';
const email = process.env.MD07_BROWSER_EMAIL;
const password = process.env.MD07_BROWSER_PASSWORD;
if (!email || !password) throw new Error('Browser E2E requires disposable test credentials');
const login = await fetch(apiBase + '/auth/login?landing=1', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
});
const auth = await login.json();
assert.equal(login.status, 200, JSON.stringify(auth).slice(0, 1000));
assert.ok(auth.access_token, 'test tenant login must issue a token');
const request = async (path, method = 'GET', body) => {
  const result = await fetch(apiBase + path, {
    method, headers: {
      Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json'
    }, ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await result.json();
  assert.ok(result.ok, method + ' ' + path + ' failed: ' + JSON.stringify(data).slice(0, 1000));
  return data;
};
const lib = await request('/component-library');
for (const id of ['KioskContainer', 'KioskCard']) assert.ok(lib.components.some((x) => x.apiName === id), id);
const name = 'MD07_NESTED_BROWSER_E2E';
const source = {
  apiName: name, label: 'MD07 Nested Browser Test', targetObject: 'Account',
  pageType: 'Home Page', layoutMode: 'free-canvas', template: 'one-region',
  canvasWidth: 1000, canvasHeight: 780, status: 'Draft',
  devices: ['Desktop','Phone'], activationAssignments: [],
  components: [
    { id: 'md07-root', type: 'Custom:KioskContainer', label: 'Test Container', region: 'main', visible: true,
      position: { x: 20, y: 20, width: 850, height: 580 },
      properties: { libraryComponentId: 'KioskContainer', layoutContainer: true, layoutStyle: { padding: 24, backgroundColor: '#ffffff' } }
    },
    { id: 'md07-card', type: 'Custom:KioskCard', label: 'Test Card', region: 'main', visible: true,
      position: { x: 40, y: 40, width: 310, height: 180 },
      properties: { libraryComponentId: 'KioskCard', layoutParentId: 'md07-root', title: 'Nested card works' }
    }
  ]
};
await request('/metadata/pages/' + name, 'PUT', source);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
  const url = 'http://127.0.0.1:5173/une/setup/page-builder/' + name;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 45000 });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('#login-email').waitFor({ state: 'hidden', timeout: 60000 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const root = page.locator('.free-canvas-stage [data-component-id="md07-root"]');
  const card = page.locator('.free-canvas-stage [data-component-id="md07-card"]');
  await root.waitFor({ state: 'visible', timeout: 60000 });
  await card.waitFor({ state: 'visible' });
  assert.equal(await root.locator('[data-component-id="md07-card"]').count(), 1, 'nested child must be inside container in rendered canvas');

  await root.click({ position: { x: 18, y: 12 } });
  const inspector = page.locator('.page-component-style-editor');
  await inspector.getByLabel('Edit layout breakpoint').selectOption('Base');
  await inspector.locator('input[aria-label="Padding"]').fill('32');
  assert.equal(await root.evaluate((element) => Math.round(parseFloat(getComputedStyle(element).paddingTop))), 32);
  await inspector.getByLabel('Edit layout breakpoint').selectOption('Phone');
  await inspector.locator('input[aria-label="Padding"]').fill('12');
  await page.getByRole('button', { name: 'Phone preview' }).click();
  assert.equal(await root.evaluate((element) => Math.round(parseFloat(getComputedStyle(element).paddingTop))), 12,
    'phone breakpoint should override default padding');
  await page.getByRole('button', { name: 'Desktop preview' }).click();
  assert.equal(await root.evaluate((element) => Math.round(parseFloat(getComputedStyle(element).paddingTop))), 32,
    'desktop must retain base padding');

  await card.click({ position: { x: 30, y: 12 } });
  await page.getByRole('tab', { name: 'Data & Actions' }).first().click();
  const parentPicker = page.getByLabel('Parent container');
  assert.equal(await parentPicker.inputValue(), 'md07-root', 'parent relationship must be editable');
  await parentPicker.selectOption('');
  assert.equal(await root.locator('[data-component-id="md07-card"]').count(), 0, 'child can be moved back to root');
  const rootBounds = await root.boundingBox();
  assert.ok(rootBounds, 'nested container must have a rendered bounding box');
  await card.dragTo(root, { targetPosition: {
    x: Math.max(12, Math.floor(rootBounds.width * 0.75)),
    y: Math.max(12, Math.floor(rootBounds.height * 0.75))
  } });
  assert.equal(await root.locator('[data-component-id="md07-card"]').count(), 1, 'drag and drop nests an existing child');
  assert.equal(await page.getByLabel('Parent container').inputValue(), 'md07-root');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await root.waitFor({ state: 'visible', timeout: 60000 });
  assert.equal(await root.locator('[data-component-id="md07-card"]').count(), 1);
  assert.equal(await root.evaluate((element) => Math.round(parseFloat(getComputedStyle(element).paddingTop))), 32);
  const saved = (await request('/metadata/pages')).pages.find((item) => item.apiName === name);
  assert.ok(saved, 'saved test page must remain queryable');
  assert.equal(saved.components.find((item) => item.id === 'md07-root').properties.layoutStyle.padding, 32);
  assert.equal(saved.components.find((item) => item.id === 'md07-root').properties.layoutResponsive.Phone.padding, 12);
  assert.equal(saved.components.find((item) => item.id === 'md07-card').properties.layoutParentId, 'md07-root');
  console.log('PASS: authenticated browser nested component editing, styling, save and reopen');
} catch (error) {
  console.error('Browser E2E failure at URL:', page.url());
  console.error('Visible screen:', (await page.locator('body').innerText().catch(() => '')).slice(0, 3500));
  await page.screenshot({ path: '/tmp/md07-browser-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
