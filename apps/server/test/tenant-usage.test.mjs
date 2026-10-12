import assert from 'node:assert/strict';
import test from 'node:test';
import { tenantUsageSnapshot } from '../src/tenant-usage.mjs';

const tenant = () => ({
  objects: [
    { apiName: 'Account', kind: 'Standard Object', fields: [{}, {}] },
    { apiName: 'Job__c', kind: 'Custom Object', fields: [{}] }
  ],
  records: { Account: [{ id: 'a', secret: 'never-return' }], Job__c: [{ id: 'b' }, { id: 'c' }] },
  flows: [{ status: 'Draft', activeVersion: null }, { status: 'Active', activeVersion: 2 }],
  reports: [{ privateConfig: 'hidden' }], dashboards: [{}], pages: [{}], apps: [{}],
  namedCredentials: [{ ciphertext: 'private-credential' }],
  approvalRequests: [{ status: 'Pending' }, { status: 'Approved' }]
});
const users = [
  { tenantId: 'a', disabled: false, passwordHash: 'hidden-hash' },
  { tenantId: 'a', disabled: true, email: 'private@email.example' },
  { tenantId: 'b', disabled: false, email: 'other@tenant.example' }
];
test('MD-03.8 computes only tenant-owned counters without raw records, credentials or identities', () => {
  const result = tenantUsageSnapshot({
    tenantId: 'a', tenant: tenant(), users,
    registry: { status: 'ACTIVE', domains: [{ status: 'VERIFIED' }, { status: 'PENDING' }] },
    now: new Date('2026-10-12T12:00:00.000Z')
  });
  assert.equal(result.counts.users, 2);
  assert.equal(result.counts.activeUsers, 1);
  assert.equal(result.counts.objects, 2);
  assert.equal(result.counts.customObjects, 1);
  assert.equal(result.counts.fields, 3);
  assert.equal(result.counts.records, 3);
  assert.equal(result.counts.flows, 2);
  assert.equal(result.counts.activeFlows, 1);
  assert.equal(result.counts.namedCredentials, 1);
  assert.equal(result.counts.pendingApprovals, 1);
  assert.equal(result.counts.verifiedDomains, 1);
  assert.equal(result.storageBytes, null);
  assert.equal(result.enforcement, 'advisory_only');
  const response = JSON.stringify(result);
  for (const secret of ['hidden-hash', 'private@email', 'other@tenant', 'never-return', 'private-credential']) {
    assert.ok(!response.includes(secret), secret);
  }
});
test('MD-03.8 warning targets are advisory, scoped, and update immediately', () => {
  const input = { tenantId: 'a', tenant: tenant(), users,
    registry: { status: 'ARCHIVED', usageTargets: { users: 2, records: 4, flows: 1, objects: 5 } } };
  const snapshot = tenantUsageSnapshot(input);
  assert.deepEqual(snapshot.warnings, ['users', 'flows']);
  assert.deepEqual(snapshot.targets, { users: 2, records: 4, objects: 5, flows: 1 });
  assert.equal(snapshot.status, 'ARCHIVED');
  input.tenant.records.Account.push({});
  assert.deepEqual(tenantUsageSnapshot(input).warnings, ['users', 'records', 'flows']);
  assert.equal(input.tenant.records.Account.length, 2, 'computing usage must not alter canonical state');
});
test('MD-03.8 empty legacy tenant safely has zero counts', () => {
  const result = tenantUsageSnapshot({ tenantId: 'legacy', tenant: {}, users: [],
    registry: { status: 'SUSPENDED' }, now: new Date(0) });
  assert.equal(result.counts.records, 0);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.status, 'SUSPENDED');
});
test('MD-03.8 refuses missing tenant and invalid sample time', () => {
  assert.throws(() => tenantUsageSnapshot({ tenantId: '', tenant: tenant(), users, registry: {} }));
  assert.throws(() => tenantUsageSnapshot({ tenantId: 'a', tenant: null, users, registry: {} }));
  assert.throws(() => tenantUsageSnapshot({ tenantId: 'a', tenant: tenant(), users,
    registry: {}, now: new Date('invalid') }));
});
