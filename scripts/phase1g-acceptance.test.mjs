import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const load = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const architecture = load('contracts/metadata-self-hosting.v1.json');
const schema = load('contracts/metadata-schema-compatibility.v1.json');
const references = load('contracts/component-reference-compatibility.v1.json');

test('published metadata contracts agree on reusable components, objects and security', () => {
  assert.equal(architecture.schemaVersion, 1);
  assert.equal(schema.schemaVersion, 1);
  assert.equal(references.schemaVersion, 1);
  assert.equal(new Set(schema.contracts.map(c => c.name)).size, 7);
  for (const authority of architecture.authorities) {
    assert.ok(existsSync(new URL(authority.path, root)), authority.path);
  }
  assert.deepEqual(references.supportedSurfaces, ['page', 'dashboard', 'flow']);
  assert.equal(references.futureProtectedSurface, 'platform');
});

test('tenant RBAC and versioned metadata remain authoritative after modularisation', () => {
  const invariants = architecture.securityInvariants.join(' ');
  assert.match(invariants, /server-side RBAC/);
  assert.match(invariants, /OneEngine/);
  assert.match(invariants, /last-known-good/);
  const core = readFileSync(new URL('apps/server/src/core/security/record-access.ts', root), 'utf8');
  assert.match(core, /hasRecordAccess/);
  assert.match(core, /hasFieldPermission/);
  const entry = readFileSync(new URL('apps/server/src/index.ts', root), 'utf8');
  assert.match(entry, /createCoreRecordAccess/);
  assert.match(entry, /createSchedulerRuntime/);
});
