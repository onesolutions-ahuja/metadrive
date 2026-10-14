#!/usr/bin/env node
// Phase 1a: read-only inventory of tracked source and seeded metadata.
// Never inspect tenant platform-state.json or record values.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_LINES = 1000;
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?|css|scss|less|vue|svelte|py|go|rs|java|kt|swift|cs|c|cc|cpp|h|hpp|php|rb|sh|sql)$/i;
const APP_SOURCE = /^apps\/web\/src\/custom-components\//;
const CORE_SOURCE = /^apps\/(?:web|server)\/src\//;
const IGNORED_DATA = /(?:^|\/)(?:platform-state\.json|\.env(?:\.|$)|credentials|secrets)(?:$|\/)/i;
const STATIC_CORE_REFERENCE = /\b(?:Kiosk|POS|Till|KDS)(?:[A-Z][A-Za-z0-9_]*)?\b|Custom:(?:Kiosk|POS|Till|KDS)[A-Za-z0-9_]*/g;

export function countLines(content) {
  return content.length === 0 ? 0 : content.split('\n').length - Number(content.endsWith('\n'));
}

export function trackedPaths(root) {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024
  }).split('\0').filter(Boolean).sort();
}

export function seededDefinitions(content) {
  const data = JSON.parse(content);
  const names = (rows) => Array.isArray(rows)
    ? rows.filter((row) => row && typeof row.apiName === 'string').map((row) => row.apiName).sort()
    : [];
  return {
    objects: names(data.objects),
    objectFieldCounts: Array.isArray(data.objects)
      ? data.objects.filter((row) => typeof row.apiName === 'string')
        .map((row) => ({ apiName: row.apiName, count: (row.fields ?? []).length }))
        .sort((a, b) => a.apiName.localeCompare(b.apiName))
      : [],
    flows: names(data.flows),
    pages: names(data.pages),
    accessControlSections: data.accessControl && typeof data.accessControl === 'object'
      ? Object.keys(data.accessControl).sort() : []
  };
}

export function componentDefinitions(catalog, manifest) {
  const readCatalogSection = (name) => {
    const offset = catalog.indexOf('export const ' + name);
    if (offset < 0) return [];
    const tail = catalog.slice(offset);
    const end = tail.indexOf('];');
    const section = end >= 0 ? tail.slice(0, end) : tail;
    return Array.from(section.matchAll(/apiName:\s*['"]([^'"]+)['"]/g), (m) => m[1]).sort();
  };
  const published = JSON.parse(manifest);
  return {
    standardPage: readCatalogSection('standardPageComponents'),
    standardDashboard: readCatalogSection('standardDashboardComponents'),
    manifestComponents: (Array.isArray(published) ? published : [])
      .filter((row) => typeof row.apiName === 'string')
      .map((row) => ({
        apiName: row.apiName,
        surfaces: Array.isArray(row.surfaces) ? row.surfaces.filter((s) => typeof s === 'string').sort() : []
      })).sort((a, b) => a.apiName.localeCompare(b.apiName))
  };
}

export function workspaceIds(content) {
  const first = content.match(/export type WorkspaceId\s*=\s*([\s\S]*?);/);
  return first ? Array.from(first[1].matchAll(/['"]([^'"]+)['"]/g), (m) => m[1]).sort() : [];
}

export function sourceReferences(content, path, maxExamples = 12) {
  if (!CORE_SOURCE.test(path) || APP_SOURCE.test(path)) return { count: 0, examples: [] };
  const examples = [];
  let count = 0;
  for (const [index, line] of content.split('\n').entries()) {
    STATIC_CORE_REFERENCE.lastIndex = 0;
    for (const match of line.matchAll(STATIC_CORE_REFERENCE)) {
      count++;
      if (examples.length < maxExamples) {
        examples.push({ line: index + 1, identifier: match[0] });
      }
    }
  }
  return { count, examples };
}

function readTracked(root, tracked, path) {
  if (!tracked.includes(path)) return null;
  return readFileSync(join(root, path), 'utf8');
}

export function buildInventory({ root, paths = trackedPaths(root) }) {
  const tracked = [...new Set(paths)].sort();
  const sources = [];
  const oversized = [];
  const references = [];
  const directories = {};
  for (const path of tracked) {
    if (IGNORED_DATA.test(path) || !SOURCE_EXTENSION.test(path)) continue;
    const absolute = join(root, path);
    if (!existsSync(absolute)) continue;
    const content = readFileSync(absolute, 'utf8');
    const lines = countLines(content);
    const area = path.startsWith('apps/web/') ? 'web'
      : path.startsWith('apps/server/') ? 'server' : 'shared';
    const scope = APP_SOURCE.test(path) ? 'packaged-app'
      : CORE_SOURCE.test(path) ? 'platform-core' : 'other';
    sources.push({ path, lines, area, scope });
    directories[area] = (directories[area] ?? 0) + 1;
    if (lines > MAX_LINES) oversized.push({ path, lines });
    if (scope === 'platform-core') {
      const ref = sourceReferences(content, path);
      if (ref.count) references.push({ path, ...ref });
    }
  }
  const seeded = readTracked(root, tracked, 'apps/server/data/platform-metadata.json');
  const manifest = readTracked(root, tracked, 'apps/web/src/custom-components/manifest.json');
  const catalog = readTracked(root, tracked, 'apps/web/src/componentCatalog.ts');
  const metadataTypes = readTracked(root, tracked, 'apps/web/src/metadata.ts');
  const definitions = seeded ? seededDefinitions(seeded) : null;
  const components = manifest && catalog ? componentDefinitions(catalog, manifest) : null;
  return {
    schemaVersion: 1,
    scope: 'tracked repository source and checked-in seed definitions (not live tenant state)',
    sourceFileCount: sources.length,
    sourceAreas: directories,
    oversized: oversized.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path)),
    sourceFiles: sources,
    systemWorkspaces: metadataTypes ? workspaceIds(metadataTypes) : [],
    seedMetadata: definitions,
    components,
    platformCoreBusinessReferences: references.sort((a, b) => a.path.localeCompare(b.path)),
    checks: {
      tenantStateRead: false,
      registryRuntimeQueried: false,
      dynamicFlowDefinitionsCaptured: false
    }
  };
}

function cli() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const at = argv.indexOf('--output');
  if (at >= 0 && (!argv[at + 1] || argv[at + 1].startsWith('--'))) {
    throw Error('--output requires a destination path');
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const report = buildInventory({ root });
  if (at >= 0) {
    const destination = resolve(root, argv[at + 1]);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  }
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    console.log('Tracked source files: ' + report.sourceFileCount);
    console.log('Oversized files (> ' + MAX_LINES + ' lines): ' + report.oversized.length);
    console.log('Seeded objects/flows/pages: ' +
      [report.seedMetadata?.objects.length ?? 0, report.seedMetadata?.flows.length ?? 0,
        report.seedMetadata?.pages.length ?? 0].join('/'));
    console.log('Platform-core business references requiring review: ' +
      report.platformCoreBusinessReferences.reduce((sum, row) => sum + row.count, 0));
    if (at >= 0) console.log('Audit saved to: ' + argv[at + 1]);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(); } catch (error) { console.error(error); process.exitCode = 1; }
}
