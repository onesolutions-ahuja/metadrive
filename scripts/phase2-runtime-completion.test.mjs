import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAuthorizedMetadataPublication} from '../apps/server/src/modules/metadata/offline-publication.mjs';
import {metadataPayloadDigest} from '../apps/web/src/verifiedMetadataCache.ts';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Phase 2f: authenticated publication has a matching content digest',async()=>{
 const source={tenantId:'tenant-a',userId:'user-a',pages:[{apiName:'A'}],apps:[],objects:[],components:[]};
 const result=createAuthorizedMetadataPublication(source);
 assert.equal(result.publication.verifiedDigest,result.publication.revision.digest);
 assert.equal(await metadataPayloadDigest(result.content),result.publication.verifiedDigest);
 assert.notEqual(createAuthorizedMetadataPublication({...source,pages:[{apiName:'B'}]}).publication.verifiedDigest,result.publication.verifiedDigest);
 assert.throws(()=>createAuthorizedMetadataPublication({...source,tenantId:''}));
 assert.throws(()=>createAuthorizedMetadataPublication({...source,apps:null}));
});
test('Phase 2a/g: platform components are only seeded by trusted bundled code',()=>{
 const manifest=JSON.parse(read('apps/web/src/custom-components/manifest.json'));
 const platform=manifest.filter(item=>item.surfaces.includes('platform'));
 assert.ok(platform.length,'No protected components are registered');
 for(const item of platform){
  assert.equal(item.scope,'platform-system');
  assert.ok(item.surfaces.includes('page'));
  assert.ok(item.version>0);
  assert.ok(read('apps/web/src/custom-components/'+item.jsx).includes('export default'));
 }
 const server=read('apps/server/src/index.ts');
 assert.ok(server.includes("requirePermission('metadata:read')"));
 assert.ok(server.includes("entry.surfaces.includes('platform') && entry.scope !== 'platform-system'"));
 assert.ok(server.includes("component.scope === 'platform-system' && component.trustedBundled === true"));
 const restricted=server.slice(server.indexOf('const libraryComponentInputSchema'),server.indexOf('type LibraryComponent ='));
 assert.ok(!restricted.includes("publicationStatus: z.enum(['Draft','Published']).default('Published'),\n  scope:"));
});
test('Phase 2f: verified metadata cache is wired into the production loader',()=>{
 const app=read('apps/web/src/App.tsx');
 assert.ok(app.includes("readVerifiedMetadata("));
 assert.ok(app.includes("saveVerifiedMetadata("));
 assert.ok(!app.includes("readOfflineMetadata("));
 assert.ok(!app.includes("saveOfflineMetadata("));
 const server=read('apps/server/src/index.ts');
 assert.ok(server.includes("app.get('/api/metadata/offline-publication', requirePermission('metadata:read')"));
 assert.ok(server.includes("canOpenApp(principal,tenant,item.apiName)"));
 assert.ok(server.includes("libraryComponentVisible(item,principal.tenantId,Object.keys(state.tenants))"));
});
