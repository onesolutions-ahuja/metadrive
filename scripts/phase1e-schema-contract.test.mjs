import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=new URL('../',import.meta.url);
const data=JSON.parse(readFileSync(new URL('contracts/metadata-schema-compatibility.v1.json',base),'utf8'));
test('Phase 1e provides seven backward-compatible metadata contracts',()=>{
assert.equal(data.schemaVersion,1);
assert.equal(data.contracts.length,7);
assert.equal(new Set(data.contracts.map(x=>x.name)).size,7);
for(const entry of data.contracts) assert.ok(entry.identity && entry.legacy && entry.extend.length);
});
test('Phase 1e preserves protected security and existing runtime',()=>{
const guarantees=data.guarantees.join(' ');
for(const value of ['RBAC','SQL','Flow runtime','last-known-good']) assert.ok(guarantees.includes(value));
});
