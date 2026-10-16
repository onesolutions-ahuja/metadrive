import test from 'node:test';
import assert from 'node:assert/strict';
import {planPageReplacement,validateMapping} from '../scripts/migrate-page-components.mjs';
const approved={from:'LegacyCard',to:'OneCard',tenantApproved:true,parityVerified:true,metadataSnapshotVerified:true,draftPublishRollbackVerified:true};
const registered=[{apiName:'OneCard',status:'Published',surfaces:['page'],propertyDefinitions:[{propertyKey:'title'}]}];

test('preserves IDs, properties, child references, events and layout',()=>{
 const before={apiName:'Home',components:[{id:'42',type:'Custom:LegacyCard',properties:{title:'Hello'},events:{click:'flow'},position:{x:1,y:2},children:['a']}]};
 const {page,changes}=planPageReplacement(before,[approved],registered);
 assert.equal(changes.length,1);
 assert.equal(page.components[0].type,'Custom:OneCard');
 assert.deepEqual({...page.components[0],type:'Custom:LegacyCard'},before.components[0]);
 assert.equal(before.components[0].type,'Custom:LegacyCard');
});
test('rejects unknown definitions, missing property parity or incomplete approval',()=>{
 const p={components:[{id:'1',type:'Custom:LegacyCard',properties:{unknown:'x'}}]};
 assert.throws(()=>planPageReplacement(p,[approved],registered),/Property parity mismatch/);
 assert.throws(()=>planPageReplacement(p,[approved],[]),/Missing published/);
 assert.throws(()=>planPageReplacement(p,[{...approved,parityVerified:false}],registered),/Unapproved/);
});
test('mapping is tenant-bound and rejects duplicate or ambiguous names',()=>{
 assert.deepEqual(validateMapping({tenantId:'tenant-1',mappings:[approved]},'tenant-1'),[approved]);
 assert.throws(()=>validateMapping({tenantId:'tenant-2',mappings:[approved]},'tenant-1'),/mismatch/);
 assert.throws(()=>validateMapping({tenantId:'tenant-1',mappings:[approved,approved]},'tenant-1'),/Duplicate/);
});
