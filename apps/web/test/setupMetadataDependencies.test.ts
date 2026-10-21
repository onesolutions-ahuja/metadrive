import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldLoadFlowDefinitions } from '../src/core/workspace/SetupShell/useSetupMetadata';

test('Page Builder loads Flow definitions for component event bindings', () => {
  assert.equal(shouldLoadFlowDefinitions(true, 'page-builder'), true);
  assert.equal(shouldLoadFlowDefinitions(true, 'flow-builder'), true);
  assert.equal(shouldLoadFlowDefinitions(true, 'scheduled-flows'), true);
  assert.equal(shouldLoadFlowDefinitions(true, 'app-exchange'), true);
  assert.equal(shouldLoadFlowDefinitions(true, 'record-list'), false);
  assert.equal(shouldLoadFlowDefinitions(false, 'page-builder'), false);
});


import { readFileSync } from 'node:fs';
import { defaultAccessControl } from '../src/core/metadata/Definitions/metadata';

test('tenant RBAC renders no fictitious users, permissions, or profiles before SQL responds', () => {
  assert.deepEqual(defaultAccessControl.users, []);
  assert.deepEqual(defaultAccessControl.profiles, []);
  assert.deepEqual(defaultAccessControl.permissionSets, []);
  assert.deepEqual(defaultAccessControl.roles, []);
});

test('RBAC requests start before bulk metadata resolves and cannot display placeholder identities', () => {
  const loader = readFileSync(new URL('../src/core/workspace/SetupShell/useSetupMetadata.ts', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/core/workspace/SetupShell/setupShellPresentation.tsx', import.meta.url), 'utf8');
  const requestAt = loader.indexOf("void apiRequest<AccessControlMetadata>('/metadata/permissions')");
  const bulkAt = loader.indexOf('const [objectPayload, flowPayload,');
  assert.ok(requestAt > 0 && bulkAt > requestAt, 'permissions request must not wait for editor bootstrap');
  assert.match(page, /!accessControlLoaded\s*\?/);
  assert.match(page, /Loading live tenant users and permissions/);
  assert.match(page, /Unable to load tenant users and permissions/);
});

test('Setup Home never presents made-up audit entries as tenant events', () => {
  const home = readFileSync(new URL('../src/core/settings/SetupHome/setupHomeView.tsx', import.meta.url), 'utf8');
  assert.ok(home.includes("/auth/security-events?limit=3"));
  assert.ok(!home.includes('Renewal Risk Evaluation'));
  assert.ok(!home.includes('Alexandra Curtis'));
});


test('analytics and flow tabs do not present pending API results as empty lists', () => {
  const page=readFileSync(new URL('../src/core/workspace/SetupShell/setupShellPresentation.tsx',import.meta.url),'utf8');
  const loader=readFileSync(new URL('../src/core/workspace/SetupShell/useSetupMetadata.ts',import.meta.url),'utf8');
  assert.match(page,/!reportsLoaded\s*\|\|\s*!advancedMetadataLoaded/);
  assert.match(page,/!dashboardsLoaded\s*\|\|\s*!advancedMetadataLoaded/);
  assert.match(page,/loading=\{!flowDefinitionsLoaded\s*\|\|\s*!advancedMetadataLoaded\}/);
  assert.match(loader,/setReportsLoaded\(true\)/);
  assert.match(loader,/setDashboardsLoaded\(true\)/);
  assert.match(loader,/setFlowDefinitionsLoaded\(true\)/);
});
