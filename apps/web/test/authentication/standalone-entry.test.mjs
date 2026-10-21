import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {resolveStandaloneEntry} from '../../src/core/workspace/Standalone/standaloneEntries.ts';

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
  assert.match(app,/resolveStandaloneEntry\(window\.location\.pathname/);
  assert.match(app,/LazyStandaloneRuntime entry=\{standaloneEntry\}/);
  assert.match(app,/return <SetupApp entryTiming=/);
});

test('standalone app shell verifies granted app and renders only published app pages',()=>{
  const runtime=readFileSync(new URL('../../src/core/workspace/Standalone/StandaloneRuntime.tsx',import.meta.url),'utf8');
  assert.match(runtime,/\/metadata\/apps/);
  assert.match(runtime,/appResponse\.apps\.find\(item=>item\.apiName===entry\.appId\)/);
  assert.match(runtime,/navigationPageApiNames/);
  assert.match(runtime,/LazyPublishedRuntime/);
  assert.match(runtime,/\/auth\/logout/);
  assert.doesNotMatch(runtime,/setupAppShell|AppManager|PageBuilder/);
});
