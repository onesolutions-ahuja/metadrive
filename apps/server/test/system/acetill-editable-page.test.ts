import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAcetillEditablePage,ACETILL_EDITOR_PAGE}
 from '../../src/app-seeders/acetill-editable-page.js';
import type {PoolClient} from 'pg';

test('Acetill editable copy is only seeded for installed entitled tenant, without overwrites',async()=>{
 const statements:{sql:string;values:unknown[]}[]=[];
 const client={query:async(sql:string,values:unknown[])=>{
   statements.push({sql,values});
   if(sql.includes('SELECT a.id'))return {rows:[{id:'app-id'}],rowCount:1};
   return {rows:[],rowCount:1};
 }} as unknown as PoolClient;
 assert.equal(await seedAcetillEditablePage(client,'tenant-1'),true);
 assert.equal(statements.length,3);
 assert.match(statements[1].sql,/ON CONFLICT\(tenant_id,api_name\) DO NOTHING/);
 assert.match(statements[2].sql,/ON CONFLICT\(tenant_id,page_id\) DO NOTHING/);
 assert.match(statements[2].sql,/'Draft'/);
 assert.ok(statements.every(s=>!s.sql.includes('UPDATE md_page_definitions')));
 assert.equal(statements[1].values[1],ACETILL_EDITOR_PAGE);
});
test('No app installation means no Page Builder page creation',async()=>{
 let called=0;
 const client={query:async()=>{
   called++;return {rows:[],rowCount:0};
 }} as unknown as PoolClient;
 assert.equal(await seedAcetillEditablePage(client,'unlicensed'),false);
 assert.equal(called,1);
});
