#!/usr/bin/env node
/**
 * Phase 1b: inspect the EXISTING component catalog, registered runtime paths,
 * property controls, surfaces and known gaps. Read-only, no tenant-state reads.
 * Source: Git-tracked files only. The live tenant registry is out of scope.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentDefinitions, trackedPaths } from './audit-platform-architecture.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = Object.freeze({
  catalog: 'apps/web/src/componentCatalog.ts',
  manifest: 'apps/web/src/custom-components/manifest.json',
  metadata: 'apps/web/src/metadata.ts',
  backend: 'apps/server/src/index.ts',
  sqlShadow: 'apps/server/sql/component-registry-v4.sql',
  libraryUi: 'apps/web/src/ComponentLibrary.tsx',
  palette: 'apps/web/src/pageBuilderPalette.ts',
  props: 'apps/web/src/componentProperties.ts',
  propertyEditor: 'apps/web/src/CustomComponentPropertyEditor.tsx',
  appearance: 'apps/web/src/metadataAppearanceSchema.ts',
  host: 'apps/web/src/RegisteredComponent.tsx',
  sandbox: 'apps/web/src/ComponentSandbox.tsx',
  lookup: 'apps/web/src/componentRegistryLookup.ts',
  page: 'apps/web/src/pageRuntimeViews.tsx',
  dashboard: 'apps/web/src/DashboardBuilder.tsx',
  flow: 'apps/web/src/FlowScreenContent.tsx',
  flowBuilder: 'apps/web/src/FlowBuilder.tsx',
  installer: 'apps/server/src/bundled-app-components.mjs'
});

export function propertyTypesFromDefaults(defaults) {
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) return [];
  return Object.keys(defaults).sort().map((name) => {
    const value = defaults[name];
    const valueType = Array.isArray(value) ? 'array'
      : value === null ? 'null' : typeof value;
    return { name, valueType };
  });
}

function evidence(content, needle, path) {
  const index = content.indexOf(needle);
  if (index === -1) return null;
  return { path, line: content.slice(0, index).split('\n').length };
}

function scopedSection(source, start, end) {
  const from = source.indexOf(start);
  if (from < 0) return '';
  const stop = source.indexOf(end, from + start.length);
  return source.slice(from, stop < 0 ? undefined : stop);
}

export function declaredSurfaces(source) {
  const libraryType = scopedSection(source, 'export type LibraryComponentMetadata = {', 'jsxSource:');
  const match = libraryType.match(/surfaces:\s*Array<([^>]+)>/);
  return match
    ? [...new Set(Array.from(match[1].matchAll(/'([^']+)'/g), (m) => m[1]))].sort() : [];
}

export function backendSurfaces(source) {
  const schema = scopedSection(source, 'export const libraryComponentSchema =', 'export const libraryComponentInputSchema =');
  const match = schema.match(/surfaces:\s*z\.array\(z\.enum\(\[([^\]]+)\]\)\)/);
  return match
    ? [...new Set(Array.from(match[1].matchAll(/'([^']+)'/g), (m) => m[1]))].sort() : [];
}

export function sqlSurfaces(source) {
  const schema = scopedSection(source, 'CREATE TABLE IF NOT EXISTS md_v4_component_surfaces', 'CREATE TABLE IF NOT EXISTS md_v4_component_dependencies');
  const match = schema.match(/surface\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(surface\s+IN\s*\(([^)]+)\)\)/);
  return match
    ? [...new Set(Array.from(match[1].matchAll(/'([^']+)'/g), (m) => m[1]))].sort() : [];
}

export function propertySchemaGroups(source) {
  const names = [
    'appearanceNumberFields', 'appearanceColorFields', 'appearanceChoiceFields',
    'responsiveNumberFields', 'responsiveOptionFields', 'responsiveColorFields'
  ];
  return Object.fromEntries(names.map((name) => {
    const section = scopedSection(source, 'export const ' + name + ' = [', '] as const;');
    return [name, [...new Set(Array.from(section.matchAll(/\bkey:\s*'([^']+)'/g), (m) => m[1]))].sort()];
  }));
}

export function propertyEditorTypes(source) {
  const declaration = source.match(/export type ComponentPropertyKind\s*=\s*([^;]+);/);
  return declaration
    ? [...new Set(Array.from(declaration[1].matchAll(/'([^']+)'/g), (m) => m[1]))].sort() : [];
}

export function describeManifest(manifest, paths) {
  if (!Array.isArray(manifest)) throw Error('Expected component manifest array');
  const entries = manifest.map((item) => {
    if (!item || typeof item.apiName !== 'string' || !item.apiName) {
      throw Error('Component manifest entry has no API name');
    }
    const assets = [item.jsx, item.css]
      .filter((name) => typeof name === 'string' && name.length > 0)
      .map((name) => {
        const path = 'apps/web/src/custom-components/' + name;
        return { path, tracked: paths.includes(path) };
      });
    const binding = item.defaults?.actionFlows;
    const eventNames = binding && typeof binding === 'object' && !Array.isArray(binding)
      ? Object.keys(binding).sort() : [];
    return {
      apiName: item.apiName,
      origin: 'checked-in-custom-manifest',
      surfaces: Array.isArray(item.surfaces)
        ? [...new Set(item.surfaces.filter((x) => typeof x === 'string'))].sort() : [],
      propertyTypes: propertyTypesFromDefaults(item.defaults),
      flowEventNames: eventNames,
      assets
    };
  });
  return entries.sort((a, b) => a.apiName.localeCompare(b.apiName));
}

export function buildComponentRegistryAudit({ root = ROOT, paths = trackedPaths(root) } = {}) {
  const tracked = [...new Set(paths)].sort();
  const loaded = Object.fromEntries(Object.entries(INPUT).map(([key, path]) => [
    key, tracked.includes(path) && existsSync(join(root, path))
      ? readFileSync(join(root, path), 'utf8') : null
  ]));
  const missingInputs = Object.entries(INPUT)
    .filter(([key]) => loaded[key] === null).map(([, path]) => path).sort();
  if (missingInputs.length) {
    throw Error('Missing component audit source(s): ' + missingInputs.join(', '));
  }
  // The extracted schemas/service remain audit inputs without forcing legacy fixtures
  // to supply modules that did not exist before the refactor.
  const backendSources = [
    loaded.backend,
    ...['apps/server/src/modules/components/library-schema.ts',
      'apps/server/src/modules/components/library-service.ts']
      .filter((path) => tracked.includes(path) && existsSync(join(root, path)))
      .map((path) => readFileSync(join(root, path), 'utf8'))
  ].join('\n');
  const catalogs = componentDefinitions(loaded.catalog, loaded.manifest);
  const manifests = describeManifest(JSON.parse(loaded.manifest), tracked);
  const catalogEntries = [
    ...catalogs.standardPage.map((apiName) => ({
      apiName, origin: 'standard-page-code-catalog', surfaces: ['page'],
      propertyTypes: [], flowEventNames: [], assets: []
    })),
    ...catalogs.standardDashboard.map((apiName) => ({
      apiName, origin: 'standard-dashboard-code-catalog', surfaces: ['dashboard'],
      propertyTypes: [], flowEventNames: [], assets: []
    })),
    ...manifests
  ];
  const components = catalogEntries.sort((a, b) =>
    a.apiName.localeCompare(b.apiName) || a.origin.localeCompare(b.origin));
  const surfaces = {
    frontendDefinition: declaredSurfaces(loaded.metadata),
    backendRegistration: backendSurfaces(backendSources),
    sqlShadow: sqlSurfaces(loaded.sqlShadow)
  };
  const consumers = [
    ['page', INPUT.page, 'RegisteredComponent', 'Custom:'],
    ['dashboard', INPUT.dashboard, 'RegisteredComponent', "component.type === 'Custom'"],
    ['flow', INPUT.flow, 'RegisteredComponent', "type === 'Custom Component'"]
  ].map(([surface, path, runtimeAnchor, instanceAnchor]) => {
    const content = loaded[surface];
    return {
      surface, path,
      registryLookup: evidence(content, 'findRegisteredComponent', path),
      registeredHost: evidence(content, runtimeAnchor, path),
      customInstance: evidence(content, instanceAnchor, path)
    };
  });
  const sharedProps = propertySchemaGroups(loaded.appearance);
  const editorTypes = propertyEditorTypes(loaded.props);
  const componentRuntime = {
    registeredHost: evidence(loaded.host, 'export default function RegisteredComponent', INPUT.host),
    trustedBundleBoundary: evidence(loaded.host, "definition.trustedBundled !== true", INPUT.host),
    sandboxedUntrustedSource: evidence(loaded.sandbox, 'sandbox="allow-scripts"', INPUT.sandbox),
    publishedRegistryLookup: evidence(loaded.lookup, 'findRegisteredComponent', INPUT.lookup),
    flowBuilderSurfaceSelection: evidence(loaded.flowBuilder, "component.surfaces.includes('flow')", INPUT.flowBuilder),
    libraryUiSurfaces: [...new Set(
      Array.from(
        scopedSection(loaded.libraryUi, 'const [surfaces, setSurfaces]', 'const [resize, setResize]')
          .matchAll(/'(page|dashboard|flow|platform)'/g), (m) => m[1])
    )].sort(),
    backendBundledManifestIterator: evidence(loaded.installer, 'installedComponentDescriptors', INPUT.installer)
  };
  const groupedNames = new Map();
  for (const entry of components) {
    groupedNames.set(entry.apiName, [...(groupedNames.get(entry.apiName) ?? []), entry.origin]);
  }
  const duplicateNames = [...groupedNames.entries()]
    .filter(([, origins]) => origins.length > 1)
    .map(([apiName, origins]) => ({ apiName, origins: origins.sort() }))
    .sort((a, b) => a.apiName.localeCompare(b.apiName));
  const findings = [];
  const flag = (id, severity, summary, value) =>
    findings.push({ id, severity, summary, evidence: value });
  if (!surfaces.frontendDefinition.includes('platform') ||
      !surfaces.backendRegistration.includes('platform')) {
    flag('PLATFORM_SURFACE_MISSING', 'migration-required',
      'Current published component registration does not support the platform surface',
      [INPUT.metadata, INPUT.backend]);
  }
  if (!backendSources.includes('propertyDefinitions:') ||
      !loaded.metadata.includes('propertyDefinitions:')) {
    flag('TYPED_PROPERTIES_NOT_ON_REGISTRATION', 'migration-required',
      'Shared style/property controls exist, but registered library definitions have no typed property schema',
      [INPUT.metadata, INPUT.backend, INPUT.propertyEditor]);
  }
  if (editorTypes.length < 4) {
    flag('PROPERTY_EDITOR_PRIMITIVE_ONLY', 'migration-required',
      'Existing custom-property editor supports primitive types only',
      [INPUT.props, INPUT.propertyEditor]);
  }
  if (catalogs.standardPage.length || catalogs.standardDashboard.length) {
    flag('STANDARD_COMPONENTS_SEPARATE_CATALOG', 'migration-required',
      'Standard components currently use code catalogs rather than registered library definitions',
      [INPUT.catalog, INPUT.host]);
  }
  if (loaded.palette.includes("'Kiosk'") || loaded.palette.includes("'Till'")) {
    flag('VERTICAL_PALETTE_CATEGORIES', 'review',
      'Page Builder palette contains hardcoded business-vertical categories',
      [INPUT.palette]);
  }
  if (manifests.some((entry) => entry.assets.some((asset) => !asset.tracked))) {
    flag('MANIFEST_ASSET_NOT_TRACKED', 'review',
      'At least one checked-in component manifest asset is missing from tracked source',
      [INPUT.manifest]);
  }
  if (duplicateNames.length) {
    flag('CATALOG_API_NAME_COLLISION', 'review',
      'Component names overlap across catalog sources; confirm ownership before migrating',
      [INPUT.catalog, INPUT.manifest]);
  }
  if (loaded.sqlShadow.includes('no production cutover')) {
    flag('SQL_REGISTRY_SHADOW_ONLY', 'information',
      'Component registry v4 SQL declares a shadow model, not an active persistence authority',
      [INPUT.sqlShadow]);
  }
  return {
    schemaVersion: 1,
    subphase: '1b',
    scope: 'tracked code catalogs, bundled manifest and registered runtime declarations only',
    liveTenantComponentsQueried: false,
    components,
    totals: {
      standardPage: catalogs.standardPage.length,
      standardDashboard: catalogs.standardDashboard.length,
      checkedInManifest: manifests.length,
      distinctNames: groupedNames.size
    },
    supportedSurfaces: surfaces,
    consumers,
    sharedPropertySchemaKeys: sharedProps,
    propertyEditorSupportedTypes: editorTypes,
    runtime: componentRuntime,
    duplicateNames,
    findings
  };
}

function main(argv = process.argv.slice(2)) {
  const at = argv.indexOf('--output');
  if (at >= 0 && (!argv[at + 1] || argv[at + 1].startsWith('--'))) {
    throw Error('--output requires a destination path');
  }
  const result = buildComponentRegistryAudit();
  if (at >= 0) {
    const destination = resolve(ROOT, argv[at + 1]);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
  }
  if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('Catalog components: ' + result.totals.distinctNames);
    console.log('Standard page/dashboard/manifest: ' +
      [result.totals.standardPage, result.totals.standardDashboard,
        result.totals.checkedInManifest].join('/'));
    console.log('Supported registration surfaces: ' +
      result.supportedSurfaces.frontendDefinition.join(', '));
    console.log('Migration findings: ' + result.findings.length);
    if (at >= 0) console.log('Audit saved to: ' + argv[at + 1]);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (err) { console.error(err); process.exitCode = 1; }
}
