import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryPageComponentReferences, assertSafeReplacement} from '../scripts/audit-page-component-tenant-references.mjs';

test('tenant SQL reference report counts page, dashboard and flow without exporting properties',()=>{
  const rows=[
    {tenant_id:'tenant-a',collection_name:'pages',payload:{apiName:'Home',components:[{id:'saved-id',type:'Custom:SystemPanel',properties:{secret:'hidden'}},{type:'Custom:OneCard'}]}},
    {tenant_id:'tenant-a',collection_name:'dashboards',payload:{components:[{type:'Custom',customComponentApiName:'ChatterInbox'}]}},
    {tenant_id:'tenant-a',collection_name:'flows',payload:{elements:[{type:'Custom Component',componentApiName:'AdminField'}]}}
  ];
  const result=inventoryPageComponentReferences(rows);
  assert.equal(result.length,4);
  assert(result.some(x=>x.apiName==='SystemPanel'&&x.references===1));
  assert(result.some(x=>x.apiName==='ChatterInbox'&&x.surface==='dashboard'));
  assert(result.some(x=>x.apiName==='AdminField'&&x.surface==='flow'));
  assert(!JSON.stringify(result).includes('hidden'));
});
test('replacement refuses suggestions without every tenant evidence gate',()=>{
  const ref={tenantId:'tenant-a',apiName:'SystemPanel'};
  assert.throws(()=>assertSafeReplacement({tenantId:'tenant-a',from:'SystemPanel',to:'OneCard'},ref),/refused/);
  assert.throws(()=>assertSafeReplacement({tenantId:'tenant-b',from:'SystemPanel',to:'OneCard',tenantApproved:true,parityVerified:true,metadataSnapshotVerified:true,draftPublishRollbackVerified:true},ref),/refused/);
  assert.equal(assertSafeReplacement({tenantId:'tenant-a',from:'SystemPanel',to:'OneCard',tenantApproved:true,parityVerified:true,metadataSnapshotVerified:true,draftPublishRollbackVerified:true},ref),'OneCard');
});
