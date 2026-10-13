import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../apps/web/src/App.tsx', import.meta.url), 'utf8');

test('session refresh aborts while waiting on another browser tab lock', () => {
  assert.match(source, /function withAuthRefreshLock\(refresh: \(\) => Promise<Response>, signal\?: AbortSignal\)/);
  assert.match(source, /navigator\.locks\.request<Response>\('metadrive-auth-refresh', \{ signal \}, async \(\) => await refresh\(\)\)/);
  assert.match(source, /\}\), controller\.signal\s*\)/);
});

test('startup failure is bounded and exposes retry instead of an indefinite loading screen', () => {
  assert.match(source, /const retryDelaysMs = \[1500\]/);
  assert.match(source, /window\.setTimeout\(\(\) => controller\.abort\(\), 9000\)/);
  assert.match(source, /setAuthState\('error'\)/);
  assert.match(source, /onRetry=\{\(\) => \{ setAuthState\('loading'\); void restoreSession\(\); \}\}/);
});

test('refresh failure does not bypass authentication', () => {
  assert.match(source, /if \(response\.status === 401\) \{\s*accessToken = undefined;\s*setAuthError\(''\);\s*setAuthState\('anonymous'\)/);
  assert.match(source, /accessToken = session\.access_token/);
});
