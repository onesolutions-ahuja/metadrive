import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitComponentProperties,mergeComponentProperties} from '../apps/server/src/modules/metadata/component-property-hybrid.mjs';
const sql=readFileSync(new URL('../apps/server/sql/component-properties-relational-stage.sql',import.meta.url),'utf8');
test('hybrid component schema keeps common properties as columns and specialist data JSONB',()=>{
 for(const name of ['metadrive_component_definitions_sql','metadrive_component_property_definitions_sql','metadrive_page_component_instances_sql'])
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+name));
 for(const name of ['width','height','x','y','background_color','text_color','font_size','padding','border_radius'])
  assert.match(sql,new RegExp('\\b'+name+' TEXT'));
 assert.match(sql,/additional_properties JSONB NOT NULL DEFAULT/);
 assert.match(sql,/jsonb_typeof\(additional_properties\)='object'/);
 assert.doesNotMatch(sql,/CREATE TABLE IF NOT EXISTS metadrive_component_property_values_sql/);
});
test('migration remains additive and does not change production storage',()=>{
 assert.doesNotMatch(sql,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM|ALTER TABLE)\b/i);
 assert.match(sql,/FOREIGN KEY \(tenant_id,component_api_name\)/);
});

test('hybrid adapter preserves custom and fixed property settings',()=>{
 const original={width:'100%',height:200,backgroundColor:'#ffffff',columns:3,
  actionFlows:{submit:{actionType:'Flow',flowApiName:'SubmitBasket'}}};
 const {fixed,additional_properties}=splitComponentProperties(original);
 assert.equal(fixed.width,'100%');
 assert.equal(fixed.height,'200');
 assert.equal(additional_properties.columns,3);
 assert.deepEqual(mergeComponentProperties({...fixed,additional_properties}),
  {...original,height:'200'});
 assert.throws(()=>mergeComponentProperties({additional_properties:{width:50}}),/may not override/);
 assert.throws(()=>splitComponentProperties({position:1}),/Structural property/);
});
