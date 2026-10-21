import assert from 'node:assert/strict';
import {test} from 'node:test';
import {seedAceKioskAppCatalog} from '../../src/app-seeders/acekiosk-app-catalog.js';

test('AceKiosk app catalog registration is idempotent and never installs/licences a tenant',async()=>{
 const queries:string[]=[];
 const db={transaction:async(fn:(tx:{query:(s:string,values?:unknown[])=>Promise<{rows:Array<{id:string}>}>})=>Promise<void>)=>{
   await fn({query:async(sql:string)=>{queries.push(sql);return {rows:[{id:'app-id'}]};}});
 }};
 await seedAceKioskAppCatalog(db as never);
 assert.match(queries.join(' '),/ON CONFLICT\(api_name\) DO NOTHING/);
 assert.match(queries.join(' '),/ON CONFLICT\(app_id,version\) DO NOTHING/);
 assert.doesNotMatch(queries.join(' '),/INSERT INTO md_app_installations|INSERT INTO md_app_entitlements|md_page_definitions/);
});
