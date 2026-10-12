import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const json = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

test('foundation: both workspaces have runnable development and production entrypoints', () => {
  const rootPkg = json('package.json');
  const web = json('apps/web/package.json');
  const server = json('apps/server/package.json');
  assert.deepEqual(rootPkg.workspaces, ['apps/*']);
  for (const key of ['dev:web', 'dev:server', 'build', 'start:server']) {
    assert.equal(typeof rootPkg.scripts[key], 'string', key);
  }
  for (const key of ['dev', 'build', 'preview']) assert.equal(typeof web.scripts[key], 'string');
  for (const key of ['dev', 'build', 'start', 'test']) assert.equal(typeof server.scripts[key], 'string');
  assert.ok(web.dependencies.react, 'web must depend on React');
  assert.ok(server.dependencies.express, 'server must depend on Express');
  assert.ok(server.dependencies.pg, 'server must depend on PostgreSQL client');
  assert.ok(server.dependencies.jose, 'server must depend on token library');
  assert.ok(existsSync(resolve(root, 'apps/server/src/index.ts')));
});

test('foundation: the operator runbook explicitly names unresolved gates', () => {
  const text = readFileSync(resolve(root, 'docs/PLATFORM_FOUNDATION.md'), 'utf8');
  for (const phrase of ['Aiven', 'Temporal', 'tenant', 'read-after-restart', 'Partial']) {
    assert.ok(text.includes(phrase), `missing runbook coverage: ${phrase}`);
  }
});
