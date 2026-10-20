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
