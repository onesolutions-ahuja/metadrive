import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AppRuntime} from '../../src/system-files/app-runtime.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

test('app installation rejects missing dependencies before writing installation',async()=>{
 const queries:string[]=[];
 const db={transaction:async(fn:(client:{query:(sql:string,args?:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>fn({
  query:async(sql:string)=>{queries.push(sql);
   if(sql.includes('SELECT a.id FROM md_apps'))return {rows:[{id:'app-id'}]};
   if(sql.includes('FROM md_app_dependencies d'))return {rows:[{api_name:'SharedInventory'}]};
   return {rows:[],rowCount:0};}
 })} as unknown as SqlPersistence;
 await assert.rejects(
  ()=>new AppRuntime(db,async()=>({objects:[]})).install('tenant','Retail'),
  /Missing installed and entitled app dependencies: SharedInventory/
 );
 assert.equal(queries.some(q=>q.includes('INSERT INTO md_app_installations')),false);
});
test('app uninstall protects installed dependent apps',async()=>{
 const queries:string[]=[];
 const db={transaction:async(fn:(client:{query:(sql:string,args?:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>fn({
  query:async(sql:string)=>{queries.push(sql);return sql.includes('SELECT dependent.api_name')
    ?{rows:[{api_name:'Retail'}]}:{rows:[],rowCount:0};}
 })} as unknown as SqlPersistence;
 await assert.rejects(()=>new AppRuntime(db).uninstall('tenant','Inventory'),/Cannot uninstall app required by: Retail/);
 assert.equal(queries.some(q=>q.startsWith('DELETE')),false);
});
