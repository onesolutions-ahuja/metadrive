import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../apps/server/sql/component-property-contracts-v1.sql', import.meta.url),'utf8');
test('component relational property contracts reject non-bindable fields',()=>{
  assert.match(sql,/md_v4_guard_component_property_binding/);
  assert.match(sql,/Component property is not bindable/);
  assert.match(sql,/Unknown component property/);
});
test('currency defaults use numeric SQL column',()=>{
  assert.match(sql,/property_kind IN \('NUMBER','CURRENCY'\)/);
  assert.match(sql,/property_kind NOT IN \('NUMBER','CURRENCY','BOOLEAN'\)/);
});
test('no destructive schema changes or JSON property storage',()=>{
  assert.doesNotMatch(sql,/\bDROP TABLE\b|\bTRUNCATE\b|\bDELETE FROM\b/i);
  assert.doesNotMatch(sql,/\bJSONB?\b/i);
});
