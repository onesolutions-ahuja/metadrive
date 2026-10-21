import assert from 'node:assert/strict';
import test from 'node:test';
import {PageRuntime} from '../../src/system-files/page-runtime.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

test('installed package navigation resolves its legacy SQL App Page',async()=>{
  const statements:string[]=[];
  const db={
    async query(sql:string){
      statements.push(sql);
      if(sql.includes('SELECT p.api_name FROM md_page_definitions p'))
        return {rows:[{api_name:'AcetillSale'}],rowCount:1};
      if(sql.includes('SELECT EXISTS('))return {rows:[{found:false}],rowCount:1};
      if(sql.includes('SELECT id,title FROM md_page_definitions'))
        return {rows:[{id:'sale-page',title:'New Sale'}],rowCount:1};
      if(sql.includes('SELECT id,component_api,slot,sort_order'))
        return {rows:[{id:'sale-title',component_api:'OneText',slot:'header',sort_order:5}],rowCount:1};
      return {rows:[],rowCount:0};
    }
  } as unknown as SqlPersistence;
  const result=await new PageRuntime(db).resolveAppPage('tenant-1','Acetill','AcetillSale','Desktop');
  assert.equal(result?.page.apiName,'AcetillSale');
  assert.equal(result?.page.components[0].type,'OneText');
  assert.ok(statements.some(sql=>sql.includes('md_tenant_app_navigation')));
});

test('unlisted package pages are not exposed by App Page resolution',async()=>{
  const db={
    async query(sql:string){
      if(sql.includes('SELECT p.api_name FROM md_page_definitions p'))
        return {rows:[],rowCount:0};
      return {rows:[],rowCount:0};
    }
  } as unknown as SqlPersistence;
  assert.equal(await new PageRuntime(db).resolveAppPage('tenant-1','Acetill','PrivatePage','Desktop'),null);
});
