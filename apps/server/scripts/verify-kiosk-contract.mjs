import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const src = read('./bootstrap-kiosk.mjs');
const component = read('../../web/src/custom-components/KioskOrderingExperience/KioskOrderingExperience.jsx');
const pages = ['kiosk.editable.json', 'kiosk.page.json'].map((name) =>
  JSON.parse(read('../../web/src/page-presets/' + name)));
assert.equal(spawnSync(process.execPath, ['--check', new URL('./bootstrap-kiosk.mjs', import.meta.url).pathname], { encoding: 'utf8' }).status, 0, 'Bootstrap syntax');
transformSync(component, { loader: 'jsx', format: 'cjs', jsx: 'transform', target: 'es2020' });
assert(!component.includes('setCart('), 'Kiosk must not manage business cart state locally');
assert(!component.includes('Complete demo order'), 'Demo checkout must be removed');
for (const page of pages) {
  const components = page.components.filter((item) => item.type === 'Custom:KioskOrderingExperience');
  assert.equal(components.length, 1, 'Kiosk preset must use a single registered component');
  const p = components[0].properties;
  assert.equal(p.objectApiName, 'Product__c');
  assert.equal(p.cartObjectApiName, 'CartLine__c');
  assert(!Object.hasOwn(p, 'products'), 'Products cannot be stored as per-card page properties');
  for (const event of ['start', 'add', 'remove', 'quantity', 'reset'])
    assert.match(p.actionFlows[event]?.flowApiName ?? '', /^KIOSK_/);
  assert(!p.actionFlows.checkout, 'Checkout must not activate without a verified payment provider');
}
for (const name of ['Product__c', 'CartLine__c', 'NamedDevice__c', 'Cart__c', 'PaymentTransaction__c'])
  assert(src.includes("'" + name + "'"), 'Missing object bootstrap: ' + name);
const start = src.indexOf("    const resource = (name, dataType");
const end = src.indexOf("    const kiosk = tenant.pages.find", start);
assert(start > 0 && end > start, 'Flow bootstrap missing');
const code = src.slice(start, end);
const tenant = { flows: [] };
new Function('tenant', code)(tenant);
for (const name of ['KIOSK_SESSION_START','KIOSK_CART_ADD','KIOSK_CART_QUANTITY','KIOSK_CART_REMOVE','KIOSK_CART_RESET','KIOSK_CHECKOUT']) {
  const flow = tenant.flows.find((item) => item.apiName === name);
  assert(flow, name + ' not created');
  assert.equal(flow.elements[0].type, 'Start');
  const ids = new Set(flow.elements.map((item) => item.id));
  for (const edge of flow.connectors) {
    assert(ids.has(edge.from) && ids.has(edge.to), name + ' has invalid edge');
  }
}
assert.equal(tenant.flows.find((f) => f.apiName === 'KIOSK_CHECKOUT').status, 'Draft');
console.log('Kiosk source, metadata, cart actions, and inactive payment guard verified.');
