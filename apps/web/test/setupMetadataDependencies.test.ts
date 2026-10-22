import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldLoadFlowDefinitions } from '../src/core/workspace/SetupShell/useSetupMetadata';

test('Page Builder loads Flow definitions for component event bindings', () => {
  assert.equal(shouldLoadFlowDefinitions(true, 'page-builder'), true);
  assert.equal(shouldLoadFlowDefinitions(true, 'flow-builder'), true);
  assert.equal(shouldLoadFlowDefinitions(true, 'scheduled-flows'), true);
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


test('landing bootstrap reuses its tenant metadata instead of fetching objects, pages and apps again', () => {
  const loader = readFileSync(new URL('../src/core/workspace/SetupShell/useSetupMetadata.ts', import.meta.url), 'utf8');
  assert.match(loader, /if \(entryTiming\?\.landing\)\s*\{\s*pending\.set\('\/metadata\/objects', Promise\.resolve\(\{ objects: entryTiming\.landing\.objects \}\)\);\s*pending\.set\('\/metadata\/pages', Promise\.resolve\(\{ pages: entryTiming\.landing\.pages \}\)\);\s*pending\.set\('\/metadata\/apps', Promise\.resolve\(\{ apps: entryTiming\.landing\.apps \}\)\);\s*\}/);
  assert.match(loader, /const existing = pending\.get\(path\);\s*if \(existing\) return existing as Promise<T>;/);
  // The server-authorised page/home-page endpoint remains in the runtime; this
  // optimization only removes redundant bootstrap fetches, not RBAC checks.
  const runtime = readFileSync(new URL('../src/core/pages/PageRuntime/pageRuntimeViews.tsx', import.meta.url), 'utf8');
  assert.match(runtime, /\/apps\/\$\{encodeURIComponent\(appId\)\}\/pages\/\$\{encodeURIComponent\(pageApiName\)\}/);
  assert.match(runtime, /\/apps\/\$\{encodeURIComponent\(appId\)\}\/home-page/);
});


test('session restore does not automatically spend a second timeout after a hung refresh', () => {
  const app = readFileSync(new URL('../src/core/workspace/App/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const timedOut = error instanceof DOMException && error\.name === 'AbortError';/);
  assert.match(app, /if \(timedOut \|\| !retryableNetworkFailure \|\| attempt === retryDelaysMs\.length\)/);
  assert.match(app, /The workspace API is not responding yet\. Check the API connection and retry\./);
  assert.match(app, /onRetry=\{\(\) => \{ setAuthError\(''\); setAuthState\('anonymous'\); void restoreSession\(\); \}\}/);
});


test('shared API coalesces only identical default GETs and preserves explicit request options', () => {
  const client = readFileSync(new URL('../src/core/authentication/Client/authClient.ts', import.meta.url), 'utf8');
  assert.match(client, /if \(init !== undefined\) return performApiRequest<T>\(path, init\);/);
  assert.match(client, /const key = JSON\.stringify\(\[accessToken \?\? null, path\]\);/);
  assert.match(client, /const existing = inFlightGetRequests\.get\(key\);\s*if \(existing\) return existing as Promise<T>;/);
  assert.match(client, /if \(inFlightGetRequests\.get\(key\) === request\) inFlightGetRequests\.delete\(key\);/);
});


test('home-page authorization and profile reads run concurrently before assignment resolution', () => {
  const server = readFileSync(new URL('../../server/src/system-support/server.ts', import.meta.url), 'utf8');
  assert.match(server, /const \\[\\,session\\]=await Promise\\.all\\(\\[\\s*rbac\\.require\\(actor\\.tenant_id,actor\\.user_id,'App:'\\+req\\.params\\.appId,'read'\\),\\s*sessionMetadata\\(db,actor\\.tenant_id,actor\\.user_id\\)\\s*\\]\\);/);
  assert.match(server, /const assigned=await apps\\.homePage\\(actor\\.tenant_id,req\\.params\\.appId,factor\\.toLowerCase\\(\\),session\\.user\\.profileId\\);/);
});


test('Lightning page loading uses its metadata query instead of a redundant existence round trip', () => {
  const runtime = readFileSync(new URL('../../server/src/system-files/page-runtime.ts', import.meta.url), 'utf8');
  assert.match(runtime, /const page=rows\\[0\\];if\\(!page\\)return null;/);
  assert.match(runtime, /const page=await this\\.metadata\\(tenantId,pageApi\\);\\s*return page\\?\\{page\\}:this\\.loadLegacy\\(tenantId,pageApi\\);/);
  assert.doesNotMatch(runtime, /SELECT EXISTS\\(\\s*SELECT 1 FROM md_page_definitions p JOIN md_lightning_page_details/);
});
