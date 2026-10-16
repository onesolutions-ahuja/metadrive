import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const source = path => readFileSync(resolve(root, path), 'utf8');
const contract = load('contracts/metadata-self-hosting.v1.json');

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

test('current shared runtimes exist and use the canonical platform engines', () => {
  const modules = [
    'core/security/record-access.ts',
    'core/security/security-audit.ts',
    'modules/flows/flow-context-runtime.ts',
    'scheduler/runtime-bootstrap.ts',
    'modules/integrations/http-callout-executor.ts',
    'modules/integrations/connector-lifecycle.ts',
    'modules/reports/filter-validation.ts',
    'modules/dashboards/runtime.ts',
    'modules/pages/activation-access.ts',
    'modules/records/field-history.ts',
    'modules/components/library-service.ts'
  ];
  for (const module of modules) {
    assert.ok(existsSync(resolve(root, 'apps/server/src', module)), module);
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

test('server entry point composes shared runtimes rather than duplicating their algorithms', () => {
  const entry = source('apps/server/src/index.ts');
  assert.ok(entry.split('\n').length < 4000, 'bootstrap must remain below architectural ceiling');
  for (const registrar of ['registerRecordRoutes', 'registerReportRoutes', 'registerDashboardRoutes']) {
    assert.ok(entry.includes(registrar), registrar);
  }
  for (const factory of ['createCoreRecordAccess', 'createSchedulerRuntime', 'createHttpCalloutExecutor']) {
    assert.ok(entry.includes(factory), factory);
  }
});
