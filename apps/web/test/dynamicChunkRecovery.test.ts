import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isMissingDynamicChunk,canAutoRecoverChunk} from '../src/core/workspace/Bootstrap/dynamicChunkRecovery';

test('Object Manager lazy module missing after deployment is recognised across browser error variants',()=>{
 assert.equal(isMissingDynamicChunk(new TypeError('Failed to fetch dynamically imported module: https://example.test/assets/objectManagerView-old.js')),true);
 assert.equal(isMissingDynamicChunk(new TypeError('Expected a JavaScript module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML spec.')),true);
 assert.equal(isMissingDynamicChunk(new Error('A business validation failed')),false);
});

test('missing chunk reload never loops for the same deep-linked Object Manager route',()=>{
 const url='https://example.test/setup/object-manager/Product';
 assert.equal(canAutoRecoverChunk(url,200000),true);
 assert.equal(canAutoRecoverChunk(url+'?_md_chunk_reload=199000',200000),false);
 assert.equal(canAutoRecoverChunk(url,200000,'/setup/object-manager/Product|199000'),false);
});
