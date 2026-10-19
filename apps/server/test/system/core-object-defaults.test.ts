import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {reconcileCoreObjectDefaults} from '../../src/app-seeders/core-object-defaults.js';

test('core default reconciliation stays additive and transactional',async()=>{
 const statements:string[]=[];
 const db={
  transaction:async(run:(client:{query:(sql:string,args?:readonly unknown[])=>Promise<{rows:unknown[]}>})=>Promise<void>)=>
   run({query:async(sql:string)=>{statements.push(sql);return {rows:[]};}})
 } as unknown as SqlPersistence;
 await reconcileCoreObjectDefaults(db);
 assert.ok(statements[0].includes('pg_advisory_xact_lock'));
 for(const table of ['md_object_page_layouts','md_object_page_layout_sections',
   'md_object_page_layout_fields','md_object_page_layout_actions','md_object_record_types']){
  assert.ok(statements.some(sql=>sql.includes('INSERT INTO '+table)),table);
 }
 for(const sql of statements.slice(1)){
  assert.match(sql,/NOT EXISTS/);
  assert.match(sql,/ON CONFLICT DO NOTHING/);
  assert.match(sql,/^\s*INSERT INTO /i);
 }
});
