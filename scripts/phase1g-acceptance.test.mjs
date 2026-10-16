import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const base=new URL('../',import.meta.url);
const load=p=>JSON.parse(readFileSync(new URL(p,base),'utf8'));
const architecture=load('contracts/metadata-self-hosting.v1.json');
const schema=load('contracts/metadata-schema-compatibility.v1.json');
const references=load('contracts/component-reference-compatibility.v1.json');
const migration=load('docs/metadata-driven-platform/MIGRATION_MAP.v1.json');
const dependencies=load('docs/metadata-driven-platform/MIGRATION_DEPENDENCIES.v1.json');
test('Phase 1g cross-contract coverage and existing authorities',()=>{
  assert.equal(architecture.schemaVersion,1);
  assert.equal(schema.schemaVersion,1);
  assert.equal(references.schemaVersion,1);
  assert.equal(migration.schemaVersion,1);
  assert.equal(dependencies.schemaVersion,1);
  const names=new Set(schema.contracts.map(c=>c.name));
  assert.equal(names.size,7);
  for(const authority of architecture.authorities) assert.ok(existsSync(new URL(authority.path,base)),authority.path);
  for(const source of migration.sources) assert.ok(existsSync(new URL(source.path,base)),source.path);
});
test('Phase 1g migration dependency ownership and safety',()=>{
  const byPath=new Map(migration.sources.map(s=>[s.path,s.phase]));
  const done=new Set();
  for(const stage of dependencies.stages){
    for(const dependency of stage.dependsOn) assert.ok(done.has(dependency),dependency);
    for(const source of stage.assets) assert.ok(byPath.has(source)&&byPath.get(source)<=stage.phase,source);
    done.add(stage.id);
  }
  assert.equal(done.size,6);
  assert.equal(dependencies.runtimeCutover,false);
  assert.deepEqual(references.supportedSurfaces,['page','dashboard','flow']);
  assert.equal(references.futureProtectedSurface,'platform');
  assert.ok(architecture.securityInvariants.some(s=>s.includes('server-side RBAC')));
});
