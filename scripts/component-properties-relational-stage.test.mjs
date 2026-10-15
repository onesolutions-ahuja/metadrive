import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const sql=readFileSync(new URL('../apps/server/sql/component-properties-relational-stage.sql',import.meta.url),'utf8');
test('normalized component property tables have no JSONB or dynamic schema identifiers',()=>{
 assert.doesNotMatch(sql,/\bJSONB\b\s+(?:NOT NULL|DEFAULT|,)/i);
 for(const name of ['metadrive_component_definitions_sql','metadrive_component_property_definitions_sql','metadrive_page_component_instances_sql','metadrive_component_property_values_sql'])
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+name));
 assert.match(sql,/width DOUBLE PRECISION/);
 assert.match(sql,/height DOUBLE PRECISION/);
 assert.match(sql,/CHECK \(num_nonnulls\(value_text,value_number,value_boolean,binding_path\)=1\)/);
});
test('migration remains additive with no destructive cutover operations',()=>{
 assert.doesNotMatch(sql,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM|ALTER TABLE)\b/i);
 assert.match(sql,/FOREIGN KEY \(tenant_id,page_api_name,instance_id\)/);
});
