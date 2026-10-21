import assert from 'node:assert/strict';
import test from 'node:test';
import {AppRuntime} from '../../src/system-files/app-runtime.js';

const app={id:'a-uuid',api_name:'Inventory',label:'Inventory'};
function fakeDb(dependencyRows:unknown[]=[],published=true,resourceRows:unknown[]=[]) {
  const statements:string[]=[];
  const fieldArguments:unknown[][]=[];
  const client={
    async query(sql:string,params:unknown[]=[] ) {
      statements.push(sql);
      if(sql.includes('SELECT a.id,a.api_name,a.label FROM md_apps'))return {rows:[app],rowCount:1};
      if(sql.includes('FROM md_app_package_versions')&&sql.includes('published=true'))
        return {rows:published?[{version:2,description:'Inventory',brand_color:'#2563eb'}]:[],rowCount:1};
      if(sql.includes('FROM md_app_package_dependencies d'))return {rows:dependencyRows,rowCount:dependencyRows.length};
      if(sql.includes('FROM md_app_package_resources'))return {rows:resourceRows,rowCount:resourceRows.length};
      if(sql.includes('FROM md_field_definitions')) {
        fieldArguments.push(params);
        return {rows:params[1]==='Product'&&params[2]==='Price'?[{id:'price'}]:[],rowCount:params[1]==='Product'&&params[2]==='Price'?1:0};
      }
      if(sql.includes('FROM md_app_package_navigation'))return {rows:[],rowCount:0};
      if(sql.includes('SELECT version FROM md_tenant_app_installed_versions'))return {rows:[],rowCount:0};
      return {rows:[],rowCount:1};
    }
  };
  const db={transaction:async <T>(run:(client:typeof client)=>Promise<T>)=>run(client)};
  return {runtime:new AppRuntime(db as never),statements,fieldArguments};
}

test('published package install writes tenant-specific metadata and version receipt',async()=>{
  const {runtime,statements}=fakeDb();
  await runtime.install('tenant-1','Inventory');
  assert.ok(statements.some(sql=>sql.includes('INSERT INTO md_app_installations')));
  assert.ok(statements.some(sql=>sql.includes('INSERT INTO md_tenant_app_metadata')));
  assert.ok(statements.some(sql=>sql.includes('INSERT INTO md_tenant_app_installed_versions')));
  assert.ok(!statements.some(sql=>sql.includes('DELETE FROM md_records')));
});

test('missing dependency aborts before installing the app',async()=>{
  const {runtime,statements}=fakeDb([{
    api_name:'Billing',minimum_version:1,installed_version:null,installed:false,licensed:false
  }]);
  await assert.rejects(runtime.install('tenant-1','Inventory'),/Install dependency first: Billing/);
  assert.ok(!statements.some(sql=>sql.includes('INSERT INTO md_app_installations')));
});

test('legacy apps continue to install without inventing a package version',async()=>{
  const {runtime,statements}=fakeDb([],false);
  await runtime.install('tenant-1','Inventory');
  assert.ok(statements.some(sql=>sql.includes('INSERT INTO md_app_installations')));
  assert.ok(!statements.some(sql=>sql.includes('INSERT INTO md_tenant_app_installed_versions')));
});

test('package field requirements validate the declared object and field order',async()=>{
  const {runtime,fieldArguments}=fakeDb([],true,[{
    resource_type:'Field',api_name:'Price',parent_api:'Product'
  }]);
  await runtime.install('tenant-1','Inventory');
  assert.deepEqual(fieldArguments,[[ 'tenant-1','Product','Price' ]]);
});

test('uninstall refuses to remove dependencies still needed by installed apps',async()=>{
  const statements:string[]=[];
  const db={transaction:async <T>(run:(client:{query:(sql:string)=>Promise<{rows:unknown[];rowCount:number}>})=>Promise<T>)=>
    run({query:async(sql:string)=>{
      statements.push(sql);
      if(sql.includes('SELECT a.id,a.api_name FROM md_apps'))return {rows:[app],rowCount:1};
      if(sql.includes('FROM md_app_package_dependencies d'))
        return {rows:[{api_name:'Billing'}],rowCount:1};
      return {rows:[],rowCount:1};
    }})};
  await assert.rejects(new AppRuntime(db as never).uninstall('tenant-1','Inventory'),
    /Uninstall dependent app first: Billing/);
  assert.ok(!statements.some(sql=>sql.includes('DELETE FROM md_app_installations')));
});

test('uninstall cancels owned jobs and removes only installation, not business metadata',async()=>{
  const statements:string[]=[];
  const db={transaction:async <T>(run:(client:{query:(sql:string)=>Promise<{rows:unknown[];rowCount:number}>})=>Promise<T>)=>
    run({query:async(sql:string)=>{
      statements.push(sql);
      if(sql.includes('SELECT a.id,a.api_name FROM md_apps'))return {rows:[app],rowCount:1};
      return {rows:[],rowCount:1};
    }})};
  await new AppRuntime(db as never).uninstall('tenant-1','Inventory');
  assert.ok(statements.some(sql=>sql.includes('UPDATE md_durable_jobs')));
  assert.ok(statements.some(sql=>sql.includes('DELETE FROM md_app_installations')));
  assert.ok(!statements.some(sql=>sql.includes('DELETE FROM md_records')));
  assert.ok(!statements.some(sql=>sql.includes('DELETE FROM md_tenant_app_metadata')));
});
