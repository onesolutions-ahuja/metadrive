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

test('standalone app shell verifies granted app and renders only published app pages',()=>{
  const runtime=readFileSync(new URL('../../src/core/workspace/Standalone/StandaloneRuntime.tsx',import.meta.url),'utf8');
  assert.match(runtime,/\/metadata\/apps/);
  assert.match(runtime,/item\.apiName\.toLowerCase\(\)===entry\.appId\.toLowerCase\(\)/);
  assert.match(runtime,/appId=\{app\?\.apiName\?\?entry\.appId\}/);
  assert.match(runtime,/navigationPageApiNames/);
  assert.match(runtime,/LazyPublishedRuntime/);
  assert.match(runtime,/\/auth\/logout/);
  assert.doesNotMatch(runtime,/setupAppShell|AppManager|PageBuilder/);
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
