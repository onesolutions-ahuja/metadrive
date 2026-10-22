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
  assert.match(loader, /let landing = entryTiming\?\.landing;/);
  assert.match(loader, /apiRequest<\{ landing\?: NonNullable<typeof landing> \}>\('\/metadata\/landing-bootstrap'\)/);
  assert.match(loader, /if \(landing\) \{\s*pending\.set\('\/metadata\/objects', Promise\.resolve\(\{ objects: landing\.objects \}\)\);\s*pending\.set\('\/metadata\/pages', Promise\.resolve\(\{ pages: landing\.pages \}\)\);\s*pending\.set\('\/metadata\/apps', Promise\.resolve\(\{ apps: landing\.apps \}\)\);\s*pending\.set\('\/auth\/me', Promise\.resolve\(\{ user: landing\.user \}\)\);\s*\}/);
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
  assert.match(server, /const \[\,session\]=await Promise\.all\(\[\s*rbac\.require\(actor\.tenant_id,actor\.user_id,'App:'\+req\.params\.appId,'read'\),\s*sessionMetadata\(db,actor\.tenant_id,actor\.user_id\)\s*\]\);/);
  assert.match(server, /const assigned=await apps\.homePage\(actor\.tenant_id,req\.params\.appId,factor\.toLowerCase\(\),session\.user\.profileId\);/);
});


test('Lightning page loading uses its metadata query instead of a redundant existence round trip', () => {
  const runtime = readFileSync(new URL('../../server/src/system-files/page-runtime.ts', import.meta.url), 'utf8');
  assert.match(runtime, /const page=rows\[0\];if\(!page\)throw new Error\('Page not found'\);/);
  assert.match(runtime, /const page=await this\.metadata\(tenantId,pageApi\)\.catch\(error=>\{\s*if\(error instanceof Error&&error\.message==='Page not found'\)return null;\s*throw error;\s*\}\);\s*return page\?\{page\}:this\.loadLegacy\(tenantId,pageApi\);/);
  assert.doesNotMatch(runtime, /SELECT EXISTS\(\s*SELECT 1 FROM md_page_definitions p JOIN md_lightning_page_details/);
});


test('login and MFA include landing bootstrap; session restore uses one authenticated bootstrap request', () => {
  const server = readFileSync(new URL('../../server/src/system-support/server.ts', import.meta.url), 'utf8');
  const login = readFileSync(new URL('../src/core/authentication/Login/loginView.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/core/workspace/App/App.tsx', import.meta.url), 'utf8');
  const loader = readFileSync(new URL('../src/core/workspace/SetupShell/useSetupMetadata.ts', import.meta.url), 'utf8');
  assert.match(server, /const landingBootstrap=async\(tenantId:string,userId:string\)=>\{/);
  assert.match(server, /rbac\.require\(tenantId,userId,'ObjectDefinition','read'\)/);
  assert.match(server, /rbac\.require\(tenantId,userId,'PageDefinition','read'\)/);
  assert.match(server, /app\.get\('\/api\/metadata\/landing-bootstrap'/);
  assert.match(server, /req\.query\.landing==='1'\?await landingBootstrap\(tenantId,userId\)/);
  assert.match(server, /req\.query\.landing==='1'\?await landingBootstrap\(actor\.tenant_id,actor\.user_id\)/);
  assert.match(login, /challenge\?'\/auth\/mfa\/verify\?landing=1'/);
  assert.match(login, /'\/auth\/login\?landing=1'/);
  assert.match(app, /fetch\(`\$\{apiBase\}\/auth\/refresh/);
  assert.doesNotMatch(app, /fetch\(`\$\{apiBase\}\/auth\/refresh\?landing=1/);
  assert.match(loader, /apiRequest<\{ landing\?: NonNullable<typeof landing> \}>\('\/metadata\/landing-bootstrap'\)/);
});


test('authorised page responses prefetch ordinary component records through RecordEngine', () => {
  const server = readFileSync(new URL('../../server/src/system-support/server.ts', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../src/core/pages/PageRuntime/pageRuntimeViews.tsx', import.meta.url), 'utf8');
  assert.match(server, /const pageInitialRecords=async\(tenantId:string,userId:string,page:/);
  assert.match(server, /records\.list\(tenantId,userId,api,50,0\)/);
  assert.match(server, /typeof \(filter as Record<string,unknown>\)\.value==='object'[\s\S]*?\(filter as Record<string,unknown>\)\.value!==null/);
  assert.match(server, /\[\.\.\.objectApis\]\.slice\(0,3\)/);
  const appPageRoute = server.slice(server.indexOf("app.get('/api/apps/:appId/pages/:pageApiName'"), server.indexOf("app.get('/api/metadata/objects'"));
  const appRbacAt = appPageRoute.indexOf("await rbac.require");
  const appResolutionAt = appPageRoute.indexOf("pages.resolveAppPage");
  const appPrefetchAt = appPageRoute.indexOf("pageInitialRecords");
  assert.ok(appRbacAt >= 0 && appRbacAt < appResolutionAt && appResolutionAt < appPrefetchAt);
  const homeRoute = server.slice(server.indexOf("app.get('/api/apps/:appId/home-page'"), server.indexOf("app.get('/api/apps/:appId/pages/:pageApiName'"));
  const homeResolutionAt = homeRoute.indexOf("apps.homePage");
  const homePrefetchAt = homeRoute.indexOf("pageInitialRecords");
  assert.ok(homeResolutionAt >= 0 && homeResolutionAt < homePrefetchAt);
  assert.match(server, /res\.json\(\{page:page\.page,initialRecords\}\)/);
  assert.match(server, /res\.json\(\{page,initialRecords\}\)/);
  assert.match(server, /res\.setHeader\('Cache-Control','private, no-store'\);\s*res\.setHeader\('Vary','Authorization, Cookie'\);\s*res\.json\(\{page:page\.page,initialRecords\}\)/);
  assert.match(runtime, /initialRecords\?: Record<string, Record<string, unknown>\[\]\>/);
  assert.match(runtime, /initialRecordsByObject=\{pageLoad\.initialRecordsByObject\}/);
  assert.match(runtime, /const initialRecords = !recordQuery\.filter[\s\S]*?if \(useInitialRecords\)/);
  assert.match(runtime, /if \(!useInitialRecords\) \{\s*setDataLoading\(true\);\s*void refresh\(\);\s*\}/);
  assert.match(runtime, /const interval = chatter \? window\.setInterval\(onVisible, 5000\) : undefined;/);
  assert.match(runtime, /if \(!objectApiName \|\| recordQuery\.blocked\)/);
  assert.match(runtime, /metadrive:page-flow-mutated', invalidateInitialRecords/);
});


test('navigation diagnostics label the measured authentication/bootstrap request accurately', () => {
  const timing = readFileSync(new URL('../src/core/workspace/Navigation/appNavigationView.tsx', import.meta.url), 'utf8');
  assert.match(timing, /session request: \$\{requestSeconds \?\? 'unknown'\}s\./);
  assert.doesNotMatch(timing, /API authentication:/);
});
