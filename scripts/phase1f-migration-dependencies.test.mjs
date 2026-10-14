import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('../',import.meta.url);
const load = p => JSON.parse(readFileSync(new URL(p,root),'utf8'));
const plan = load('docs/metadata-driven-platform/MIGRATION_DEPENDENCIES.v1.json');
const map = load('docs/metadata-driven-platform/MIGRATION_MAP.v1.json');
test('Phase 1f migration stages follow an acyclic dependency chain',()=>{
 assert.equal(plan.phase,'1f');
 assert.equal(plan.runtimeCutover,false);
 const seen=new Set();
 for(const stage of plan.stages){
  assert.ok(!seen.has(stage.id));
  for(const dependency of stage.dependsOn) assert.ok(seen.has(dependency),dependency);
  assert.equal(stage.phase,seen.size+2);
  assert.ok(stage.entryGates.length>=2 && stage.rollback.length>30);
  seen.add(stage.id);
 }
 assert.deepEqual(plan.stages.map(s=>s.phase),map.phases.slice(1).map(s=>s.number));
});
test('every rollback asset is mapped to an existing migration owner',()=>{
 const owners=new Map(map.sources.map(s=>[s.path,s.phase]));
 for(const stage of plan.stages) for(const path of stage.assets){
  assert.ok(existsSync(new URL(path,root)),path);
  assert.ok(owners.has(path),'unmapped asset '+path);
  assert.ok(owners.get(path)<=stage.phase,'dependency placed before its owner '+path);
 }
});
test('rollback safeguards protect tenant data and platform privileges',()=>{
 const rules=plan.invariants.join(' ');
 assert.match(rules,/reversible/);
 assert.match(rules,/permissions/);
 assert.match(rules,/No physical data deletion/);
 assert.ok(plan.stages.some(s=>s.rollback.includes('last-known-good')));
 assert.ok(plan.invariants.some(rule=>rule.includes('newer customer writes')));
});
