import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
// Source contract regression: the bootstrap must not render a blocking loading screen.
test('Login is immediately available before any refresh completes',()=>{
 const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');
 assert.match(app,/useState<AuthState>\('anonymous'\)/);
 assert.doesNotMatch(app,/if\s*\(authState\s*===\s*'loading'\)/);
 assert.match(app,/if \(authState === 'anonymous'\) return <Login /);
});
test('Login requests are cancelable when the API fails',()=>{
 const login=readFileSync(new URL('./loginView.tsx',import.meta.url),'utf8');
 assert.match(login,/new AbortController\(\)/);
 assert.match(login,/signal:\s*controller\.signal/);
 assert.match(login,/window\.clearTimeout\(timeout\)/);
});
