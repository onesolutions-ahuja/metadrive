import test from 'node:test';
import assert from 'node:assert/strict';
import { canAutoRecoverChunk, isMissingDynamicChunk } from '../../apps/web/src/dynamicChunkRecovery.js';

test('identifies missing Vite dynamic JS modules but not API or permission failures', () => {
 assert.equal(isMissingDynamicChunk(new TypeError('Failed to fetch dynamically imported module: https://unesolutions.co.uk/assets/pageRuntimeViews-D_c5DHDq.js')),true);
 assert.equal(isMissingDynamicChunk(new Error('Importing a module script failed.')),true);
 assert.equal(isMissingDynamicChunk(new Error('Loading chunk 12 failed.')),true);
 assert.equal(isMissingDynamicChunk(new Error('No send permission for channel')),false);
 assert.equal(isMissingDynamicChunk(new Error('API returned 403')),false);
 assert.equal(isMissingDynamicChunk({message:'Failed to fetch dynamically imported module'}),false);
});

test('one automatic reload per route and version window, without loops', () => {
 const now=Date.UTC(2026,9,16,15,0,0);
 const page='https://unesolutions.co.uk/une/setup/app-exchange?tab=installed#search';
 assert.equal(canAutoRecoverChunk(page,now),true);
 assert.equal(canAutoRecoverChunk(page+'&_md_chunk_reload='+now,now),false);
 assert.equal(canAutoRecoverChunk(page,now,'/une/setup/app-exchange|'+now),false);
 assert.equal(canAutoRecoverChunk(page,now,'/une/apps/ChatterApp/home|'+now),true);
 assert.equal(canAutoRecoverChunk(page,now+121000,'/une/setup/app-exchange|'+now),true);
 assert.equal(canAutoRecoverChunk(page+'&_md_chunk_reload='+now,now+121000),true);
});
