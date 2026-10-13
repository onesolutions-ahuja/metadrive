import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const worker = read('../public/metadrive-sw.js');
const entrypoint = read('../src/main.tsx');
const registry = read('../src/universalShell.ts');
const html = read('../index.html');

test('shared offline shell is registered from the only MetaDrive entrypoint', () => {
  assert.match(entrypoint, /registerUniversalShell\(\)/);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(registry, /navigator\.serviceWorker\.register/);
  new Script(worker, {filename:'metadrive-sw.js'});
});

test('worker excludes API, third-party content and writes from caches', () => {
  assert.match(worker, /request\.method !== 'GET'/);
  assert.match(worker, /!sameScope\(url\)/);
  assert.match(worker, /url\.pathname\.includes\('\/api\/'\)/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /CACHE_APP_ASSETS/);
  assert.doesNotMatch(worker, /authorization|bearer|refresh[_-]?token/i);
});

test('presentation cache is identity-scoped and excludes credentials from stored snapshots', () => {
  const cache = read('../src/offlineMetadataCache.ts');
  const loader = read('../src/App.tsx');
  assert.match(cache, /identity\.tenantId/);
  assert.match(cache, /identity\.userId/);
  assert.match(cache, /AES-GCM/);
  assert.match(cache, /readOfflineMetadata/);
  assert.match(cache, /clearOfflineMetadata/);
  assert.match(loader, /saveOfflineMetadata\(/);
  assert.match(loader, /!failures\.length/);
  assert.match(loader, /sessionPayload\.user\.tenantId/);
  assert.doesNotMatch(cache, /secret|refresh_token|access_token/i);
});
