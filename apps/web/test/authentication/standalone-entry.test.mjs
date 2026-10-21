import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {resolveStandaloneEntry,standaloneEntryForAppId,standaloneCanonicalPath} from '../../src/core/workspace/Standalone/standaloneEntries.ts';
import {appRoutePathWithoutBase} from '../../src/core/workspace/Navigation/appRouting.ts';

test('direct Acetill and Ace Assist routes have separate product identities',()=>{
  assert.deepEqual(
    [resolveStandaloneEntry('/acetill')?.appId,resolveStandaloneEntry('/aceassist/')?.appId],
    ['Acetill','AceAssist']);
  assert.equal(resolveStandaloneEntry('/metadrive/acetill','/metadrive/')?.appId,'Acetill');
  for(const pathname of ['/','/une/setup/home','/api/auth/login','/acetill/checkout','/notinstalled','/login']) {
    assert.equal(resolveStandaloneEntry(pathname),null,pathname);
  }
});

test('product login keeps shared MetaDrive session, MFA and password recovery',()=>{
  const login=readFileSync(new URL('../../src/core/authentication/Login/loginView.tsx',import.meta.url),'utf8');
  assert.match(login,/branding\?: ProductLoginBrand/);
  assert.match(login,/branding\.label/);
  assert.match(login,/auth\/login\?landing=1/);
  assert.match(login,/auth\/mfa\/verify/);
  assert.match(login,/LoginRecovery/);
  const app=readFileSync(new URL('../../src/core/workspace/App/App.tsx',import.meta.url),'utf8');
  assert.match(app,/standaloneCanonicalPath\(window\.location\.pathname/);
  assert.match(app,/resolveStandaloneEntry\(entryPath/);
  assert.match(app,/LazyStandaloneRuntime entry=\{standaloneEntry\}/);
  assert.match(app,/return <SetupApp entryTiming=/);
});

test('standalone app UI uses direct OneEngine records and flows without app installation or Page Builder',()=>{
  const runtime=readFileSync(new URL('../../src/core/workspace/Standalone/StandaloneRuntime.tsx',import.meta.url),'utf8');
  assert.match(runtime,/\/metadata\/objects/);
  assert.match(runtime,/\/records\//);
  assert.match(runtime,/\/flows\//);
  assert.match(runtime,/available-actions\?product=/);
  assert.match(runtime,/flowActions\.map/);
  assert.doesNotMatch(runtime,/AcetillCompleteSale|AcetillPrintReceipt|AceAssistCompleteVisit|AceAssistRescheduleVisit/);
  assert.doesNotMatch(runtime,/method:'POST'.*\/records\//);
  assert.match(runtime,/\/auth\/logout/);
  assert.doesNotMatch(runtime,/\/metadata\/apps|LazyPublishedRuntime|PageBuilder|component-library/);
});

test('custom POS and appointment UIs never fall back to published home pages',()=>{
  const runtime=readFileSync(new URL('../../src/core/workspace/Standalone/StandaloneRuntime.tsx',import.meta.url),'utf8');
  assert.match(runtime,/custom-pos/);
  assert.match(runtime,/custom-product-grid/);
  assert.match(runtime,/custom-basket/);
  assert.match(runtime,/custom-assist/);
  assert.match(runtime,/custom-week/);
  assert.match(runtime,/runAction\(action\.apiName\)/);
  assert.doesNotMatch(runtime,/Home page is not configured|LazyPublishedRuntime|LightningAppRuntime/);
});

test('old app links and metadata navigation enter the app-only frontend',()=>{
  assert.equal(standaloneEntryForAppId('Aceassist')?.slug,'aceassist');
  assert.equal(standaloneEntryForAppId('ACEASSIST')?.slug,'aceassist');
  assert.equal(standaloneCanonicalPath('/une/apps/Aceassist/home'),'/aceassist');
  assert.equal(standaloneCanonicalPath('/une/apps/AceAssist/home'),'/aceassist');
  assert.equal(standaloneCanonicalPath('/une/apps/Acetill/home'),'/acetill');
  assert.equal(standaloneCanonicalPath('/une/apps/Aceassist/pages/Visits'),'/aceassist?page=Visits');
  assert.equal(standaloneCanonicalPath('/metadrive/une/apps/ACEASSIST/home','', '/metadrive/'),'/metadrive/aceassist');
  for (const path of ['/une/apps/Other/home','/une/setup/home','/une/apps/Aceassist/records/Contact','/une/apps/Aceassist/pages/../setup']) {
    assert.equal(standaloneCanonicalPath(path),null,path);
  }
  assert.equal(appRoutePathWithoutBase({kind:'app-home',appId:'Aceassist'}),'/aceassist');
  assert.equal(appRoutePathWithoutBase({kind:'app-page',appId:'AceAssist',pageApiName:'VisitList'}),'/aceassist?page=VisitList');
  assert.equal(appRoutePathWithoutBase({kind:'app-home',appId:'Acetill'}),'/acetill');
  assert.equal(appRoutePathWithoutBase({kind:'app-home',appId:'OneKiosk'}),'/une/apps/OneKiosk/home');
});

test('user landing preference opens the assigned app without granting access',()=>{
  const app=readFileSync(new URL('../../src/core/workspace/App/App.tsx',import.meta.url),'utf8');
  const server=readFileSync(new URL('../../../server/src/system-files/session-metadata.ts',import.meta.url),'utf8');
  const auth=readFileSync(new URL('../../../server/src/system-support/server.ts',import.meta.url),'utf8');
  const schema=readFileSync(new URL('../../../server/src/system-support/migrations/20261021-user-landing-app.sql',import.meta.url),'utf8');
  assert.match(app,/landingAppApi\\?: string/);
  assert.match(app,/entryTiming\\?\\.landingAppApi\\?\\?/);
  assert.match(app,/standaloneEntryForAppId\\(landingApp\\)/);
  assert.match(app,/window\\.location\\.replace\\(destination\\)/);
  assert.match(app,/if\\(needsLandingRedirect\\)return/);
  assert.doesNotMatch(app,/apiRequest<\\{user:\\{landingAppApi/);
  assert.equal(appRoutePathWithoutBase({kind:'app-home',appId:'Acetill'}),'/acetill');
  assert.match(server,/landingAppApi:landing\\.rows\\[0\\]\\?\\.landing_app_api\\?\\?'Setup'/);
  assert.match(schema,/landing_app_api text NOT NULL DEFAULT 'Setup'/);
  assert.match(auth,/landingAppApi:await landingPreference\\(tenantId,userId\\)/);
  assert.match(auth,/landingAppApi:await landingPreference\\(session\\.tenant_id,session\\.user_id\\)/);
  assert.match(app,/standaloneEntryForAppId\\(landingApp\\)/);
});

test('AceKiosk uses independent lazy custom UI and backend Flows',()=>{
 const app=readFileSync(new URL('../../src/core/workspace/App/App.tsx',import.meta.url),'utf8');
 const kiosk=readFileSync(new URL('../../../acekiosk/src/AceKiosk.tsx',import.meta.url),'utf8');
 assert.equal(resolveStandaloneEntry('/acekiosk')?.appId,'AceKiosk');
 assert.equal(standaloneCanonicalPath('/une/apps/AceKiosk/home'),'/acekiosk');
 assert.match(app,/AceKioskAccessGate/);
 assert.match(kiosk,/AceKioskLoadMenu/);
 assert.match(kiosk,/AceKioskCheckout/);
 assert.doesNotMatch(kiosk,/\/records\/|OneShoppingCart|OneItemGrid|PageBuilder/);
});
