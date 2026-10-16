import assert from 'node:assert/strict';
import test from 'node:test';
import { metadataPrecondition, commitObjectMetadata } from '../src/modules/objects/metadata-revisions.js';

const object = { apiName: 'Example__c', revision: 3 };
test('agent1: metadata revision preconditions retain legacy absent-header compatibility', () => {
  const results: unknown[] = [];
  const res = { status(n: number) { results.push(n); return this; }, json(v: unknown) { results.push(v); return this; } };
  const mkRequest = (value?: string) => ({ header: () => value });
  assert.equal(metadataPrecondition(mkRequest() as never, res as never, object as never, (o) => o?.revision ?? 0), true);
  assert.equal(metadataPrecondition(mkRequest('"2"') as never, res as never, object as never, (o) => o?.revision ?? 0), false);
  assert.equal(results[0], 412);
  assert.deepEqual(results[1], { error: 'Metadata has changed since it was loaded; refresh before saving', expectedRevision: 3 });
});
test('agent1: metadata revisions are tenant scoped and retain immutable audit snapshots', () => {
  let saved: unknown;
  const tenant = { objects: [object], metadataHistory: [] };
  const next = commitObjectMetadata('tenant-a', 'user-a', tenant as never, 'UPDATED' as never,
    object as never, { ...object, label: 'Updated' } as never,
    (o) => o?.revision ?? 0, (tenantId, snapshot) => { assert.equal(tenantId, 'tenant-a'); saved = snapshot; });
  assert.equal(next?.revision, 4);
  assert.equal((saved as {metadataHistory: unknown[]}).metadataHistory.length, 1);
  assert.equal(object.revision, 3);
});
