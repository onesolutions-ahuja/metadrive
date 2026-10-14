import test from 'node:test';
import assert from 'node:assert/strict';
import {backendDomains,validateBackendDomainCatalog,assertTenantResourceAccess,assertMetadataRevisionWrite} from '../apps/server/src/modules/metadata/backend-convergence.ts';
test('6a-d backend domain catalog shares platform engines',()=>{
 assert.equal(validateBackendDomainCatalog(),8);
 assert.equal(new Set(backendDomains.map(x=>x.id)).size,backendDomains.length);
});
test('6e enforces tenant and permission isolation',()=>{
 const good={tenantId:'tenant-a',principalTenantId:'tenant-a',principalId:'user-1',requiredPermission:'metadata:write',grants:new Set(['metadata:write'])};
 assert.doesNotThrow(()=>assertTenantResourceAccess(good));
 assert.throws(()=>assertTenantResourceAccess({...good,principalTenantId:'tenant-b'}));
 assert.throws(()=>assertTenantResourceAccess({...good,grants:new Set()}));
 assert.throws(()=>assertTenantResourceAccess({...good,principalId:''}));
});
test('6g rejects concurrent writes with stale revisions',()=>{
 assert.doesNotThrow(()=>assertMetadataRevisionWrite({expectedRevision:2,currentRevision:2,nextRevision:3}));
 assert.throws(()=>assertMetadataRevisionWrite({expectedRevision:1,currentRevision:2,nextRevision:3}));
 assert.throws(()=>assertMetadataRevisionWrite({expectedRevision:2,currentRevision:2,nextRevision:4}));
});
