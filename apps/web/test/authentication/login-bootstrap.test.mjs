import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
// Keep the existing session-restore gate and login fallback after file moves.
test('Session restoration precedes the anonymous login fallback',()=>{
 const app=readFileSync(new URL('../../src/core/workspace/App/App.tsx',import.meta.url),'utf8');
 assert.match(app,/useState<AuthState>\('restoring'\)/);
 assert.match(app,/if \(authState === 'restoring'\) return <div className="auth-loading" role="status">/);
 assert.doesNotMatch(app,/if\s*\(authState\s*===\s*'loading'\)/);
 assert.match(app,/if \(authState === 'anonymous'\) return <Login /);
});
test('Login requests are cancelable when the API fails',()=>{
 const login=readFileSync(new URL('../../src/core/authentication/Login/loginView.tsx',import.meta.url),'utf8');
 assert.match(login,/new AbortController\(\)/);
 assert.match(login,/signal:\s*controller\.signal/);
 assert.match(login,/window\.clearTimeout\(timeout\)/);
});
