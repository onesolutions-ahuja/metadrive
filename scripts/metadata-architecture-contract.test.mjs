import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const source = path => readFileSync(resolve(root, path), 'utf8');
const contract = load('contracts/metadata-self-hosting.v1.json');
const migration = load('docs/metadata-driven-platform/MIGRATION_MAP.v1.json');

test('the versioned contract explicitly reuses existing engines instead of parallel ones', () => {
  assert.equal(contract.schemaVersion, 1);
  assert.match(contract.status, /NOT a parallel persistence model/);
  const names = contract.authorities.map(item => item.area);
  for (const name of ['Objects/CRUD', 'Components', 'Actions and Flows', 'RBAC', 'Installation', 'State']) {
    assert.ok(names.includes(name), 'Missing shared engine ' + name);
  }
  assert.equal(names.length, new Set(names).size);
  for (const authority of contract.authorities) {
    assert.ok(existsSync(resolve(root, authority.path)), authority.path);
    assert.ok(authority.reuse.length > 10);
  }
  assert.deepEqual(contract.proposedCompatibleAdditions.libraryComponentSurfaces, ['page', 'dashboard', 'flow', 'platform']);
});

test('platform definition ownership, permissions and recovery fail closed', () => {
  const scopes = contract.scopes.map(item => item.name);
  assert.deepEqual(scopes, ['platform-system', 'tenant', 'tenant-presentation-override']);
  assert.ok(contract.securityInvariants.some(value => /OneEngine/.test(value)));
  assert.ok(contract.securityInvariants.some(value => /sandboxed/.test(value)));
  assert.ok(contract.securityInvariants.some(value => /server-side RBAC/.test(value)));
  assert.ok(contract.securityInvariants.some(value => /last-known-good/.test(value)));
  assert.ok(contract.resolutionOrder.some(value => /fail closed/.test(value)));
  assert.ok(contract.migrationRules.some(value => /second metadata engine/.test(value)));
});

test('all seven migration phases have unambiguous ownership and all referenced files exist', () => {
  assert.equal(migration.schemaVersion, 1);
  assert.deepEqual(migration.phases.map(item => item.number), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(migration.sources.length >= 25);
  const paths = migration.sources.map(item => item.path);
  assert.equal(paths.length, new Set(paths).size);
  for (const item of migration.sources) {
    assert.ok(existsSync(resolve(root, item.path)), 'Missing source: ' + item.path);
    assert.ok(Number.isInteger(item.phase) && item.phase >= 2 && item.phase <= 7, item.path);
    assert.ok(item.reason.length > 20, item.path);
  }
  for (const risk of migration.knownRisks) {
    assert.ok(paths.includes(risk.source), risk.id);
  }
});

test('contract references observed reusable component, installer and RBAC paths', () => {
  const registered = source('apps/web/src/RegisteredComponent.tsx');
  assert.match(registered, /ComponentSandbox/);
  assert.match(registered, /compileComponentModule/);
  const registry = source('apps/web/src/componentRegistryLookup.ts');
  assert.match(registry, /definition.surfaces.includes/);
  const packages = source('apps/server/src/installable-app-packages.mjs');
  assert.match(packages, /applyInstallableAppPackages/);
  const security = source('apps/server/src/modules/security/metadata-routes.ts');
  assert.match(security, /requirePermission/);
  const bindings = source('apps/web/src/pageComponentBindings.ts');
  assert.match(bindings, /actionFlows/);
});

test('the phase-1 baseline records critical oversized legacy files for later extraction', () => {
  const byPath = new Map(migration.sources.map(item => [item.path, item]));
  assert.ok(byPath.get('apps/web/src/App.tsx')?.baselineLines > 1000);
  assert.ok(byPath.get('apps/server/src/index.ts')?.baselineLines > 1000);
  assert.ok(byPath.get('apps/server/test/rbac-sharing.smoke.test.ts')?.baselineLines > 1000);
  assert.ok(migration.knownRisks.some(item => item.id === 'OVERSIZED_LEGACY'));
});
