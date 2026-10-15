import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  propertyTypesFromDefaults, declaredSurfaces, backendSurfaces, sqlSurfaces,
  propertySchemaGroups, propertyEditorTypes, describeManifest, buildComponentRegistryAudit
} from './audit-component-registry.mjs';

test('default properties expose types and names without leaking configured values', () => {
  const value = {
    title: 'A confidential name', accent: '#123456', count: 5, enabled: true,
    token: { secret: 'private' }, tags: ['restricted'], empty: null
  };
  const result = propertyTypesFromDefaults(value);
  assert.deepEqual(result.map(x => x.name), Object.keys(value).sort());
  assert.equal(result.find(x => x.name === 'token')?.valueType, 'object');
  assert.equal(result.find(x => x.name === 'tags')?.valueType, 'array');
  assert.equal(result.find(x => x.name === 'empty')?.valueType, 'null');
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(JSON.stringify(result).includes('123456'), false);
});

test('surface readers inspect existing declarations, not search every random enum', () => {
  assert.deepEqual(declaredSurfaces(
    "export type LibraryComponentMetadata = {\n surfaces: Array<'page' | 'dashboard' | 'flow'>;\n jsxSource: string;"
  ), ['dashboard', 'flow', 'page']);
  assert.deepEqual(backendSurfaces(
    "const other = z.enum(['platform']);\nconst libraryComponentSchema = z.object({surfaces: z.array(z.enum(['flow','page']))});\nconst libraryComponentInputSchema = z.object({});"
  ), ['flow', 'page']);
  assert.deepEqual(sqlSurfaces(
    "CREATE TABLE IF NOT EXISTS md_v4_component_surfaces (surface TEXT NOT NULL CHECK(surface IN ('page','flow')));\nCREATE TABLE IF NOT EXISTS md_v4_component_dependencies"
  ), ['flow', 'page']);
});

test('property controls come from shared source arrays and registered property kind', () => {
  const appearance = [
    "export const appearanceNumberFields = [{key:'padding'},{key:'gap'}] as const;",
    "export const appearanceColorFields = [{key:'backgroundColor'}] as const;",
    "export const appearanceChoiceFields = [] as const;",
    "export const responsiveNumberFields = [{key:'opacity'}] as const;",
    "export const responsiveOptionFields = [] as const;",
    "export const responsiveColorFields = [] as const;"
  ].join('\n');
  const groups = propertySchemaGroups(appearance);
  assert.deepEqual(groups.appearanceNumberFields, ['gap','padding']);
  assert.deepEqual(groups.responsiveNumberFields, ['opacity']);
  assert.deepEqual(groups.responsiveColorFields, []);
  assert.deepEqual(propertyEditorTypes("export type ComponentPropertyKind = 'text' | 'number' | 'boolean';"),
    ['boolean','number','text']);
});

test('manifest inventory detects component asset coverage without copying Flow inputs', () => {
  const manifest = [
    { apiName: 'Sample', surfaces: ['page','flow','page'],
      defaults: { name: 'Customer Alice', actionFlows: {
        send: { flowApiName: 'NOTIFY_CUSTOMER', inputs: { secret: 'private' } }
      } }, jsx: 'Sample/Sample.jsx', css: 'Sample/Sample.css' }
  ];
  const entries = describeManifest(manifest, ['apps/web/src/custom-components/Sample/Sample.jsx']);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].surfaces, ['flow','page']);
  assert.deepEqual(entries[0].flowEventNames, ['send']);
  assert.deepEqual(entries[0].assets.map(x => x.tracked), [true,false]);
  assert.equal(JSON.stringify(entries).includes('Alice'), false);
  assert.equal(JSON.stringify(entries).includes('private'), false);
});

test('full audit is deterministic and ignores repository tenant runtime state', () => {
  const root = mkdtempSync(join(tmpdir(), 'registry-audit-'));
  const sources = {
    'apps/web/src/componentCatalog.ts': [
      "export const standardPageComponents = [{apiName:'Tabs'}];",
      "export const standardDashboardComponents = [{apiName:'Metric'}];"
    ].join('\n'),
    'apps/web/src/custom-components/manifest.json': JSON.stringify([
      { apiName: 'Sample', surfaces: ['page'], defaults: { secret: 'never-include-value' },
        jsx: 'Sample/Sample.jsx', css: 'Sample/Sample.css' }
    ]),
    'apps/web/src/custom-components/Sample/Sample.jsx': 'export default function Sample() {}',
    'apps/web/src/custom-components/Sample/Sample.css': '.sample{}',
    'apps/web/src/metadata.ts':
      "export type LibraryComponentMetadata = { surfaces: Array<'page'|'dashboard'|'flow'>; jsxSource: string; };",
    'apps/server/src/index.ts':
      "const libraryComponentSchema = z.object({surfaces: z.array(z.enum(['page','dashboard','flow']))});\nconst libraryComponentInputSchema = {};",
    'apps/server/sql/component-registry-v4.sql':
      "CREATE TABLE IF NOT EXISTS md_v4_component_surfaces (surface TEXT NOT NULL CHECK(surface IN ('page','dashboard','flow')));\n" +
      'CREATE TABLE IF NOT EXISTS md_v4_component_dependencies;',
    'apps/web/src/ComponentLibrary.tsx': "const [surfaces, setSurfaces] = useState<Array<'page' | 'flow'>>(['page']);\nconst [resize, setResize] = [];",
    'apps/web/src/pageBuilderPalette.ts': "const categories = ['Kiosk','Till'];",
    'apps/web/src/componentProperties.ts': "export type ComponentPropertyKind = 'text' | 'boolean';",
    'apps/web/src/CustomComponentPropertyEditor.tsx': 'export default function CustomComponentPropertyEditor() {}',
    'apps/web/src/metadataAppearanceSchema.ts':
      "export const appearanceNumberFields = [{key:'gap'}] as const;",
    'apps/web/src/RegisteredComponent.tsx':
      "export default function RegisteredComponent() { if (definition.trustedBundled !== true) return null; }",
    'apps/web/src/ComponentSandbox.tsx': '<iframe sandbox="allow-scripts" />',
    'apps/web/src/componentRegistryLookup.ts': 'function findRegisteredComponent() {}',
    'apps/web/src/setupShellPresentation.tsx': '<RegisteredComponent /> // findRegisteredComponent Custom:',
    'apps/web/src/DashboardBuilder.tsx':
      "findRegisteredComponent <RegisteredComponent /> component.type === 'Custom'",
    'apps/web/src/FlowScreenContent.tsx':
      "findRegisteredComponent <RegisteredComponent /> type === 'Custom Component'",
    'apps/web/src/FlowBuilder.tsx': "component.surfaces.includes('flow')",
    'apps/server/src/bundled-app-components.mjs': 'function* installedComponentDescriptors(){}',
    'apps/server/data/platform-state.json': 'private customer record never read'
  };
  try {
    for (const [path, content] of Object.entries(sources)) {
      const full = join(root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    const paths = Object.keys(sources).reverse();
    const a = buildComponentRegistryAudit({ root, paths });
    const b = buildComponentRegistryAudit({ root, paths: [...paths].sort() });
    assert.deepEqual(a, b);
    assert.equal(a.components.length, 3);
    assert.equal(a.totals.distinctNames, 3);
    assert.equal(a.liveTenantComponentsQueried, false);
    assert.ok(a.findings.find(x => x.id === 'PLATFORM_SURFACE_MISSING'));
    assert.ok(a.findings.find(x => x.id === 'VERTICAL_PALETTE_CATEGORIES'));
    assert.equal(a.consumers.every(c => c.registeredHost && c.registryLookup && c.customInstance), true);
    assert.equal(JSON.stringify(a).includes('never-include-value'), false);
    assert.equal(JSON.stringify(a).includes('private customer record'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('repository component registry audit detects known current consumer paths safely', () => {
  const report = buildComponentRegistryAudit();
  assert.ok(report.totals.standardPage > 0);
  assert.ok(report.totals.standardDashboard > 0);
  assert.ok(report.supportedSurfaces.frontendDefinition.includes('page'));
  assert.ok(report.supportedSurfaces.backendRegistration.includes('flow'));
  assert.ok(report.consumers.every(item => item.registeredHost !== null));
  assert.ok(report.runtime.sandboxedUntrustedSource !== null);
  assert.equal(report.liveTenantComponentsQueried, false);
  assert.equal(report.components.every(item => !Object.hasOwn(item, 'defaults')), true);
});
