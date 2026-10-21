import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ACEASSIST_APP,seedAceAssistCatalog,seedAceAssistInstalledHome} from '../../src/app-seeders/aceassist-app.js';

test('Ace Assist catalog registration does not auto-install or grant permissions',async()=>{
  const all:Array<{sql:string;args:unknown[]}>= [];
  const tx={query:async(sql:string,args:unknown[]=[])=>{
    all.push({sql,args});
    return {rows:sql.includes('SELECT id FROM md_apps')?[{id:'app-id'}]:[]};
  }};
  await seedAceAssistCatalog({transaction:async(fn:(arg:typeof tx)=>Promise<unknown>)=>fn(tx)} as never);
  assert.equal(ACEASSIST_APP.apiName,'AceAssist');
  assert.ok(all.some(row=>row.sql.includes('md_app_package_versions')));
  assert.ok(all.every(row=>!/md_app_installations|md_app_entitlements|md_permission_assignments/.test(row.sql)));
});

test('new tenant SQL landing is component-based, active and creates no appointments',async()=>{
  const all:Array<{sql:string;args:unknown[]}>= [];
  const tx={query:async(sql:string,args:unknown[]=[])=>{
    all.push({sql,args});
    if(sql.includes('SELECT a.id FROM md_apps'))return {rows:[{id:'app-id'}]};
    if(sql.includes('INSERT INTO md_page_definitions'))return {rows:[{id:'page-id'}]};
    if(sql.includes('SELECT id FROM md_page_definitions'))return {rows:[{id:'page-id'}]};
    if(sql.includes('SELECT api_name')&&sql.includes('md_component_definitions'))return {rows:[{api_name:args[1]}]};
    return {rows:[]};
  }};
  await seedAceAssistInstalledHome({transaction:async(fn:(arg:typeof tx)=>Promise<unknown>)=>fn(tx)} as never,'tenant-one');
  const calls=all.map(x=>x.sql);
  assert.equal(calls.filter(x=>x.includes('INSERT INTO md_lightning_page_nodes')).length,3);
  assert.equal(calls.filter(x=>x.includes('INSERT INTO md_app_home_pages')).length,3);
  assert.ok(calls.some(x=>x.includes('INSERT INTO md_lightning_page_details')&&x.includes("'Active'")));
  assert.ok(calls.some(x=>x.includes('INSERT INTO md_permission_sets')));
  assert.ok(!calls.some(x=>/md_records|md_record_values|md_permission_assignments/.test(x)));
  assert.ok(all.filter(x=>x.sql.includes('INSERT INTO md_lightning_page_nodes')).some(x=>x.args[3]==='Custom:OneCalendar'));
});

test('rerunning a customised Ace Assist page never overwrites nodes or styling',async()=>{
  const all:string[]=[];
  const tx={query:async(sql:string)=>{
    all.push(sql);
    if(sql.includes('SELECT a.id FROM md_apps'))return {rows:[{id:'app-id'}]};
    if(sql.includes('INSERT INTO md_page_definitions'))return {rows:[]};
    if(sql.includes('SELECT id FROM md_page_definitions'))return {rows:[{id:'page-id'}]};
    if(sql.includes('SELECT EXISTS('))return {rows:[{allowed:true}]};
    return {rows:[]};
  }};
  await seedAceAssistInstalledHome({transaction:async(fn:(arg:typeof tx)=>Promise<unknown>)=>fn(tx)} as never,'tenant-one');
  assert.ok(!all.some(x=>/INSERT INTO md_lightning_page_nodes|DELETE |UPDATE md_lightning_page_details/.test(x)));
  assert.ok(all.some(x=>x.includes('ON CONFLICT(tenant_id,app_id,form_factor) DO NOTHING')));
});
