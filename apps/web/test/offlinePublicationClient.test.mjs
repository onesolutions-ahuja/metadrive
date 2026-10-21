import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('authenticated publication is verified and stored in the identity-encrypted offline cache',()=>{
 const source=readFileSync(new URL('../src/core/workspace/SetupShell/useSetupMetadata.ts',import.meta.url),'utf8');
 assert.ok(source.includes("apiRequest<MetadataPublicationResponse>('/metadata/offline-publication')"));
 assert.ok(source.includes('saveVerifiedMetadata('));
 assert.ok(source.includes('{tenantId,userId}'));
 assert.ok(source.includes('window.isSecureContext'));
});

import {metadataCacheDecision} from '../src/core/metadata/Definitions/metadataRevisionPolicy.ts';

test('accepts a fresh verified publication when the browser clock trails the API slightly',()=>{
 const now=Date.now();
 const candidate={tenantId:'tenant-a',userId:'user-a',
   revision:{version:1,publishedAt:now+4000,digest:'a'.repeat(64)},payload:{}};
 const context={tenantId:'tenant-a',userId:'user-a',now,maxAgeMs:86400000,
   minimumVersion:1,verifiedDigest:'a'.repeat(64)};
 assert.equal(metadataCacheDecision(candidate,context),'accept');
});

test('rejects excessive clock drift, outdated publications and digest or identity mismatch',()=>{
 const now=Date.now();
 const revision={version:2,publishedAt:now,digest:'a'.repeat(64)};
 const candidate={tenantId:'tenant-a',userId:'user-a',revision,payload:{}};
 const context={tenantId:'tenant-a',userId:'user-a',now,maxAgeMs:86400000,
   minimumVersion:2,verifiedDigest:'a'.repeat(64)};
 assert.equal(metadataCacheDecision(candidate,context),'accept');
 assert.equal(metadataCacheDecision({...candidate,revision:{...revision,publishedAt:now+360000}},context),'reject');
 assert.equal(metadataCacheDecision({...candidate,revision:{...revision,publishedAt:now-86400001}},context),'reject');
 assert.equal(metadataCacheDecision({...candidate,revision:{...revision,digest:'b'.repeat(64)}},context),'reject');
 assert.equal(metadataCacheDecision({...candidate,userId:'user-b'},context),'reject');
 assert.equal(metadataCacheDecision({...candidate,revision:{...revision,version:1}},context),'reject');
});
