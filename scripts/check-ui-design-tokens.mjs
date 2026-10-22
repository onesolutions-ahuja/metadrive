// Presentation-only regression checks. Run with: node scripts/check-ui-design-tokens.mjs
// This checks baseline contracts; a passing result does not replace browser screenshots.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(new URL(path, 'file://' + root), 'utf8');
const moved = {
  'MarketingSite.tsx':'core/public/MarketingSite/MarketingSite.tsx',
  'marketing.css':'core/public/MarketingSite/marketing.css',
  'design-system.css':'core/workspace/WorkspaceTheme/design-system.css',
  'styles.css':'core/workspace/WorkspaceTheme/styles.css',
  'styles-part2.css':'core/workspace/WorkspaceTheme/styles-part2.css',
  'styles-md227.css':'core/builders/PageBuilder/styles-md227.css',
  'TenantManagement.css':'core/platform/TenantManagement/TenantManagement.css',
  'TenantDomains.css':'core/platform/TenantDomains/TenantDomains.css',
  'registeredComponentAppearance.css':'core/components/RegisteredComponent/registeredComponentAppearance.css',
  'ChecklistMultiSelect.css':'one/OneChecklistMultiSelect/ChecklistMultiSelect.css',
  'SmartFieldInput.css':'one/OneSmartFieldInput/SmartFieldInput.css',
  'FlowReferenceInput.css':'core/builders/FlowReferenceInput/FlowReferenceInput.css',
  'ReferenceBrowser.css':'one/OneReferenceBrowser/ReferenceBrowser.css',
  'AppManagerList.css':'core/applications/AppManagerList/AppManagerList.css',
  'CompanySettingsWorkspace.css':'core/settings/CompanySettingsWorkspace/CompanySettingsWorkspace.css'
};
const web = path => {
  let actual = moved[path] || path;
  if (actual.startsWith('custom-components/one/')) {
    const file = actual.split('/').at(-1);
    actual = file === 'manifest.json' ? 'one/manifest.json'
      : file === 'OneConversation.jsx' ? 'one/OneConversation/OneConversation.jsx'
      : file === 'OneShoppingCart.jsx' ? 'one/OneShoppingCart/OneShoppingCart.jsx'
      : 'one/shared/' + file;
  }
  return read('apps/web/src/' + actual);
};

const tokens = web('design-system.css');
for (const token of [
  '--md-primary:', '--md-success:', '--md-danger:', '--md-warning:',
  '--md-text:', '--md-muted:', '--md-border:', '--md-font:',
  '--md-fs-xs:', '--md-fs-body:', '--md-space-1:', '--md-space-12:',
  '--md-control-height:', '--md-control-touch:', '--md-scroll-thumb:'
]) assert.ok(tokens.includes(token), 'Missing shared design token: ' + token);

const runtime = web('main.tsx');
const marketing = web('MarketingSite.tsx');
assert.ok(runtime.includes("WorkspaceTheme/design-system.css"),
  'The public entry must load shared design tokens once for marketing and the workspace');
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
  assert.doesNotMatch(css, /font-size:\s*(?:[7-9]|10)px\b/,
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
]) assert.match(web(file), /scrollbar-width:\s*thin/, 'Missing scrollbar styling in ' + file);


function relativeLuminance(hex) {
  const value = hex.replace('#', '');
  assert.match(value, /^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, 'Expected a valid hex colour: ' + hex);
  const full = value.length === 3 ? [...value].map(part => part + part).join('') : value;
  const channels = [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
const muted = tokens.match(/--md-muted:\s*(#[0-9a-f]{3,6})/i)?.[1];
assert.ok(muted, 'Shared muted text token must have a concrete fallback colour');
for (const background of ['#ffffff', '#f6f8ff']) {
  assert.ok(contrastRatio(muted, background) >= 4.5,
    'Muted text must meet WCAG AA 4.5:1 contrast on ' + background + '; got ' + contrastRatio(muted, background).toFixed(2) + ':1');
}
const marketingCss = web('marketing.css');
assert.match(marketingCss, /--une-muted:var\(--md-muted,#596579\)/,
  'Marketing muted text must retain the contrast-safe token fallback');
for (const [foreground, background, label] of [
  ['#596579', '#f6f8ff', 'marketing muted text'],
  ['#5146b8', '#ffffff', 'POS accent text'],
  ['#9a4318', '#ffffff', 'kiosk accent text'],
]) assert.ok(contrastRatio(foreground, background) >= 4.5,
  label + ' must meet WCAG AA 4.5:1 contrast; got ' + contrastRatio(foreground, background).toFixed(2) + ':1');

console.log('Shared visual design and WCAG AA contrast contract checks passed.');
