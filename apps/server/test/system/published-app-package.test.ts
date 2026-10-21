import assert from 'node:assert/strict';
import test from 'node:test';
import {seedPublishedAppPackage} from '../../src/app-seeders/published-app-package.js';

test('published package assigns its declared Home Page without replacing an existing assignment',async()=>{
  const statements:Array<{sql:string;params:unknown[]}>=[];
  const client={
    async query(sql:string,params:unknown[]=[]){
      statements.push({sql,params});
      if(sql.includes('FROM md_app_package_page_templates'))return {rows:[],rowCount:0};
      if(sql.includes('FROM md_app_package_home_page_templates'))
        return {rows:[{page_api:'AcetillRegister',form_factor:'desktop'}],rowCount:1};
      if(sql.includes('SELECT id FROM md_page_definitions'))
        return {rows:[{id:'tenant-home-page'}],rowCount:1};
      if(sql.includes('FROM md_app_package_object_templates')
        ||sql.includes('FROM md_app_package_field_templates')
        ||sql.includes('FROM md_app_package_component_templates')
        ||sql.includes('FROM md_app_package_page_component_templates')
        ||sql.includes('FROM md_app_package_page_property_templates'))
        return {rows:[],rowCount:0};
      return {rows:[],rowCount:1};
    }
  };
  await seedPublishedAppPackage(client as never,'tenant-1','app-1',1);
  const insert=statements.find(item=>item.sql.includes('INSERT INTO md_app_home_pages'));
  assert.ok(insert);
  assert.match(insert.sql,/ON CONFLICT\(tenant_id,app_id,form_factor\) DO NOTHING/);
  assert.deepEqual(insert.params,['tenant-1','app-1','desktop','tenant-home-page']);
});
