import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../apps/server/sql/component-property-contracts-v1.sql', import.meta.url),'utf8');
test('SQL component property registry is additive and relational', () => {
  for (const table of ['md_v4_component_property_definitions','md_v4_component_property_choices','md_v4_component_instance_property_values','md_v4_component_action_flows']) {
    assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\b'));
  }
  assert.doesNotMatch(sql,/\bJSONB?\b/i);
  assert.doesNotMatch(sql,/\b(DROP TABLE|TRUNCATE|DELETE FROM|ALTER TABLE)\b/i);
  assert.match(sql,/FOREIGN KEY\s*\(component_id,version,property_key\)/);
  assert.match(sql,/Cross-tenant component property override rejected/);
  assert.match(sql,/app_api_name TEXT NOT NULL/);
  assert.match(sql,/page_api_name TEXT NOT NULL/);
  assert.match(sql,/placement_id TEXT NOT NULL/);
});
