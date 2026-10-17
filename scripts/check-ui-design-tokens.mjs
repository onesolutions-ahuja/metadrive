// Presentation-only regression checks. Run with: node scripts/check-ui-design-tokens.mjs
// This checks baseline contracts; a passing result does not replace browser screenshots.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(new URL(path, 'file://' + root), 'utf8');
const web = path => read('apps/web/src/' + path);

const tokens = web('design-system.css');
for (const token of [
  '--md-primary:', '--md-success:', '--md-danger:', '--md-warning:',
  '--md-text:', '--md-muted:', '--md-border:', '--md-font:',
  '--md-fs-xs:', '--md-fs-body:', '--md-space-1:', '--md-space-12:',
  '--md-control-height:', '--md-control-touch:', '--md-scroll-thumb:'
]) assert.ok(tokens.includes(token), 'Missing shared design token: ' + token);

const runtime = web('main.tsx');
const marketing = web('MarketingSite.tsx');
assert.match(runtime, /import\('\.\/design-system\.css'\)/,
  'Workspace must load shared design tokens');
assert.match(marketing, /import '\.\/design-system\.css'/,
  'Marketing must load shared design tokens');
assert.ok(runtime.includes('const Workspace = lazy('),
  'Workspace must remain lazily loaded');

for (const path of ['styles.css', 'styles-part2.css', 'styles-md227.css']) {
  const css = web(path);
  assert.doesNotMatch(css, /font-size:\s*(?:[7-9]|10)px\b/,
    path + ' contains operational microtype below 11px');
}

const tenant = web('TenantManagement.css');
assert.ok(!tenant.includes('#12605c'), 'Removed teal tenant primary has returned');
assert.match(tenant, /--md-primary/, 'Tenant administration must use shared primary');
const tenantDomains = web('TenantDomains.css');
assert.ok(!tenantDomains.includes('#0b4550') && !tenantDomains.includes('#126474'),
  'Tenant Domains must not restore the retired teal primary');
assert.match(tenantDomains, /--md-primary/, 'Tenant Domains buttons must use shared primary');
const appearance = web('registeredComponentAppearance.css');
assert.ok(!appearance.includes('#3176cc'), 'Shared card fallback must use design tokens');
for (const path of ['ChecklistMultiSelect.css', 'SmartFieldInput.css', 'FlowReferenceInput.css']) {
  const css = web(path);
  assert.doesNotMatch(css, /font-size:\\s*(?:[7-9]|10)px\\b/,
    'No operational microtype below 11px: ' + path);
}
const one = web('custom-components/one/one.css');
assert.match(one, /--md-primary/, 'One CSS should consume shared primary');
for (const file of [
  'OneLayout.jsx','OneData.jsx','OneDisplay.jsx','OneInputs.jsx',
  'OneActions.jsx','OneShoppingCart.jsx','OneConversation.jsx'
]) {
  const source = web('custom-components/one/' + file);
  assert.ok(!source.includes("'#3176cc'"), 'Old default blue in One ' + file);
}

const manifest = JSON.parse(web('custom-components/one/manifest.json'));
const accent = manifest.commonProperties.find(p => p.propertyKey === 'accentColor');
assert.equal(accent?.defaultValue, '#1d4ed8',
  'Metadata property default must match shared design primary');

for (const file of [
  'SmartFieldInput.css','FlowReferenceInput.css','ReferenceBrowser.css',
  'AppManagerList.css','CompanySettingsWorkspace.css','TenantManagement.css',
  'custom-components/ChatterInbox/ChatterInbox.css'
]) assert.match(web(file), /scrollbar-width:\s*thin/, 'Missing scrollbar styling in ' + file);

console.log('Shared visual design contract checks passed.');
