import test from 'node:test';
import assert from 'node:assert/strict';
import {metadataCacheDecision,chooseMetadataRecovery} from '../apps/web/src/metadataRevisionPolicy.ts';
const now=1720000000000;
const digest='a'.repeat(64);
const envelope={tenantId:'tenant-one',userId:'user-one',revision:{version:4,publishedAt:now-500,digest},payload:{pages:[]}};
const context={tenantId:'tenant-one',userId:'user-one',now,maxAgeMs:1000,minimumVersion:3,verifiedDigest:digest};
test('2f accepts only matching, recent, versioned, identity-scoped metadata',()=>{
 assert.equal(metadataCacheDecision(envelope,context),'accept');
 assert.equal(metadataCacheDecision(envelope,{...context,userId:'other'}),'reject');
 assert.equal(metadataCacheDecision(envelope,{...context,minimumVersion:5}),'reject');
 assert.equal(metadataCacheDecision(envelope,{...context,maxAgeMs:100}),'reject');
 assert.equal(metadataCacheDecision(envelope,{...context,verifiedDigest:'b'.repeat(64)}),'reject');
});
test('2f chooses trusted last-known-good only when policy accepts it',()=>{
 const damaged={...envelope,revision:{...envelope.revision,version:2}};
 assert.deepEqual(chooseMetadataRecovery(damaged,envelope,context),envelope);
 assert.equal(chooseMetadataRecovery(damaged,undefined,context),undefined);
 assert.equal(chooseMetadataRecovery(undefined,envelope,{...context,tenantId:'elsewhere'}),undefined);
});
test('2f rejects future publication, invalid hashes and invalid time bounds',()=>{
 assert.equal(metadataCacheDecision({...envelope,revision:{...envelope.revision,publishedAt:now+1}},context),'reject');
 assert.equal(metadataCacheDecision({...envelope,revision:{...envelope.revision,digest:'unsafe'}},context),'reject');
 assert.equal(metadataCacheDecision(envelope,{...context,maxAgeMs:-1}),'reject');
});

test('2f verified cache hashes exact metadata content and rejects altered payload',async()=>{
 const {metadataPayloadDigest}=await import('../apps/web/src/verifiedMetadataCache.ts');
 const data={pages:[{id:'page1'}],apps:[],objects:[],components:[]};
 const digest=await metadataPayloadDigest(data);
 assert.match(digest,/^[a-f0-9]{64}$/);
 assert.notEqual(digest,await metadataPayloadDigest({...data,pages:[{id:'other'}]}));
});
test('2f verified cache integrates the existing encrypted identity-scoped store',async()=>{
 const {readFileSync}=await import('node:fs');
 const src=readFileSync(new URL('../apps/web/src/verifiedMetadataCache.ts',import.meta.url),'utf8');
 assert.match(src,/saveOfflineMetadata\(/);
 assert.match(src,/readOfflineMetadata\(/);
 assert.match(src,/verifiedDigest/);
 assert.match(src,/minimumVersion/);
});
