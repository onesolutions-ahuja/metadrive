import test from 'node:test';
import assert from 'node:assert/strict';
import {assertMetadataOnlySeed,FORBIDDEN_SEED_STATE} from '../src/seeders/metadata-only.mjs';
import {applyVersionedSeed} from '../src/seeders/registry.mjs';

test('metadata-only packages reject all tenant state, even empty placeholders',()=>{
 for(const key of FORBIDDEN_SEED_STATE){
  assert.throws(()=>assertMetadataOnlySeed({objects:[],[key]:[]},'app'),new RegExp(key));
 }
 assert.deepEqual(assertMetadataOnlySeed({objects:[],flows:[],pages:[]}),{objects:[],flows:[],pages:[]});
});

test('SQL version ledger cannot stamp a shared or app package containing business state',async()=>{
 let queries=0;
 const client={query:async()=>{queries++;return {rows:[]};}};
 for(const kind of ['shared','app']){
  await assert.rejects(()=>applyVersionedSeed(client,{
   tenantId:'tenant-a',kind,key:'unsafe',version:'1',
   definition:{objects:[],records:{}},apply:async()=>{throw Error('should not execute');}
  }),/records/);
 }
 assert.equal(queries,0,'invalid package rejected before any SQL operation');
});
