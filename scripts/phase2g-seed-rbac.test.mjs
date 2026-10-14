import test from 'node:test';
import assert from 'node:assert/strict';
import {planSystemComponentSeeds} from '../apps/web/src/systemComponentSeedPlan.ts';
const seed={apiName:'PlatformPanel',scope:'platform-system',surfaces:['platform','page'],version:2};
test('2g requires central permission and prevents scope collision',()=>{
 assert.equal(planSystemComponentSeeds([seed],[],false).install.length,0);
 assert.ok(planSystemComponentSeeds([seed],[{...seed,scope:'tenant'}],true).errors.length);
});
test('2g idempotently upgrades only older system versions',()=>{
 assert.deepEqual(planSystemComponentSeeds([seed],[{...seed,version:1}],true).install,[seed]);
 assert.deepEqual(planSystemComponentSeeds([seed],[seed],true).skip,['PlatformPanel']);
});
test('2g rejects invalid surfaces and duplicate seeds',()=>{
 assert.ok(planSystemComponentSeeds([seed,seed],[],true).errors.length);
 assert.ok(planSystemComponentSeeds([{...seed,surfaces:['not-a-surface']}],[],true).errors.length);
});
