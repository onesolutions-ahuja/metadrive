import test from 'node:test';
import assert from 'node:assert/strict';
import { authoriseMetadataMutation } from '../src/modules/metadata/metadata-mutation.js';

const context = {
  tenantId:'tenant-a',principalTenantId:'tenant-a',principalId:'user-a',
  grants:new Set(['metadata:write']),requiredPermission:'metadata:write'
};
test('agent1: metadata mutation requires tenant identity and OneEngine grant', () => {
  assert.equal(authoriseMetadataMutation(context,3,3),4);
  assert.throws(() => authoriseMetadataMutation({...context,principalTenantId:'tenant-b'},3,3),/Cross-tenant/);
  assert.throws(() => authoriseMetadataMutation({...context,grants:new Set()},3,3),/permission denied/);
  assert.throws(() => authoriseMetadataMutation(context,2,3),/Concurrent metadata modification/);
});
