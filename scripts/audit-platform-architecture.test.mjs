import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  countLines, seededDefinitions, componentDefinitions, workspaceIds,
  sourceReferences, buildInventory
} from './audit-platform-architecture.mjs';

test('line count matches policy guard including final newline', () => {
  assert.equal(countLines(''), 0);
  assert.equal(countLines('one'), 1);
  assert.equal(countLines('one\n'), 1);
  assert.equal(countLines('one\ntwo\n'), 2);
});

test('seed inventory lists metadata identifiers only, never record contents', () => {
  const result = seededDefinitions(JSON.stringify({
    objects: [{ apiName: 'Sale', fields: [{ apiName: 'Name' }, { apiName: 'Amount' }] }],
    flows: [{ apiName: 'MakeSale' }],
    pages: [{ apiName: 'SalesPage' }],
    accessControl: { profiles: [{ userEmail: 'sensitive@example.test' }] },
    records: { Sale: [{ name: 'Private' }] }
  }));
  assert.deepEqual(result.objects, ['Sale']);
  assert.deepEqual(result.objectFieldCounts, [{ apiName: 'Sale', count: 2 }]);
  assert.deepEqual(result.flows, ['MakeSale']);
  assert.deepEqual(result.pages, ['SalesPage']);
  assert.equal(JSON.stringify(result).includes('sensitive@example.test'), false);
  assert.equal(JSON.stringify(result).includes('Private'), false);
});

test('component catalogs and workspaces are inventory-only', () => {
  const catalog = [
    "export const standardPageComponents = [{ apiName: 'Tabs' }];",
    "export const standardDashboardComponents = [{ apiName: 'Chart' }];"
  ].join('\n');
  const manifest = JSON.stringify([{ apiName: 'ChatterInbox', surfaces: ['page', 'flow'],
    defaults: { apiKey: 'secret' } }]);
  const result = componentDefinitions(catalog, manifest);
  assert.deepEqual(result.standardPage, ['Tabs']);
  assert.deepEqual(result.standardDashboard, ['Chart']);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.deepEqual(workspaceIds("export type WorkspaceId =\n | 'home'\n | 'rbac';"), ['home', 'rbac']);
});

test('platform-core references do not treat packaged app source as a core violation', () => {
  assert.equal(sourceReferences('const v = Custom:KioskScreen;', 'apps/web/src/App.tsx').count, 1);
  assert.equal(sourceReferences('const v = Custom:KioskScreen;', 
    'apps/web/src/custom-components/Kiosk/Kiosk.jsx').count, 0);
  assert.equal(sourceReferences('const v = Custom:KioskScreen;', 'apps/web/test/kiosk.test.ts').count, 0);
});

test('inventory is deterministic and does not read checked-in tenant state', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadrive-audit-'));
  const entries = {
    'apps/web/src/App.tsx': 'const v = "Custom:KioskScreen";\n',
    'apps/web/src/custom-components/Kiosk.jsx': 'const kiosk = "Kiosk";\n',
    'apps/web/src/componentCatalog.ts': "export const standardPageComponents = [{ apiName: 'Tabs' }];\n" +
      "export const standardDashboardComponents = [{ apiName: 'Chart' }];\n",
    'apps/web/src/metadata.ts': "export type WorkspaceId = 'home' | 'rbac';\n",
    'apps/web/src/custom-components/manifest.json': JSON.stringify([
      { apiName: 'Sample', surfaces: ['page'], defaults: { personal: 'sensitive' } }
    ]),
    'apps/server/data/platform-metadata.json': JSON.stringify({
      objects: [{ apiName: 'Account', fields: [] }], pages: [], flows: []
    }),
    'apps/server/data/platform-state.json': 'not even valid JSON; must not parse',
    'apps/server/src/index.ts': 'line\n'.repeat(1001)
  };
  try {
    for (const [path, content] of Object.entries(entries)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    const paths = Object.keys(entries).reverse();
    const result = buildInventory({ root, paths });
    assert.equal(result.sourceFileCount, 5);
    assert.equal(result.oversized.length, 1);
    assert.equal(result.oversized[0].lines, 1001);
    assert.equal(result.systemWorkspaces.length, 2);
    assert.deepEqual(result.seedMetadata.objects, ['Account']);
    assert.equal(result.platformCoreBusinessReferences.length, 1);
    assert.equal(JSON.stringify(result).includes('sensitive'), false);
    assert.equal(result.checks.tenantStateRead, false);
    assert.deepEqual(result.sourceFiles.map((x) => x.path),
      [...result.sourceFiles.map((x) => x.path)].sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
