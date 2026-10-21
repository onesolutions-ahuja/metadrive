import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ACETILL_PACKAGE,seedAcetillAppCatalog} from '../../src/app-seeders/acetill-app-catalog.js';

test('Acetill catalog registration is additive and never installs or licences tenants',async()=>{
  const queries:{sql:string;args:unknown[]}[]=[];
  const db={transaction:async(fn:(client:{query:(sql:string,args:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>fn({
    query:async(sql:string,args:unknown[])=>{
      queries.push({sql,args});
      if(sql.includes('INSERT INTO md_apps'))return {rows:[{id:'app-id'}]};
      return {rows:[]};
    }
  })};
  await seedAcetillAppCatalog(db as never);
  assert.equal(queries.length,3);
  assert.ok(queries.some(q=>q.sql.includes('ON CONFLICT(api_name) DO NOTHING')));
  assert.ok(queries.some(q=>q.sql.includes('INSERT INTO md_app_package_versions') && q.args[1]===1));
  assert.ok(queries.every(q=>!q.sql.includes('md_app_installations')&&!q.sql.includes('md_app_entitlements')));
  assert.equal(ACETILL_PACKAGE.apiName,'Acetill');
});

test('Acetill catalog reruns preserve existing global app and tenant customisations',async()=>{
  const queries:{sql:string;args:unknown[]}[]=[];
  const db={transaction:async(fn:(client:{query:(sql:string,args:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>fn({
    query:async(sql:string,args:unknown[])=>{
      queries.push({sql,args});
      if(sql.includes('INSERT INTO md_apps'))return {rows:[]};
      if(sql.includes('SELECT id FROM md_apps'))return {rows:[{id:'existing-id'}]};
      return {rows:[]};
    }
  })};
  await seedAcetillAppCatalog(db as never);
  await seedAcetillAppCatalog(db as never);
  assert.equal(queries.filter(q=>q.sql.includes('INSERT INTO md_app_package_versions')).length,2);
  assert.ok(queries.filter(q=>q.sql.includes('INSERT INTO md_app_package_versions')).every(q=>q.args[0]==='existing-id'));
  assert.ok(queries.every(q=>!q.sql.includes('UPDATE md_tenant_app_metadata')&&!q.sql.includes('DELETE ')));
});
