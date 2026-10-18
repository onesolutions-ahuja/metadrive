import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {applySystemMigrations} from '../../src/system-support/system-migrations.js';

test('system migrations are additive, recorded, and idempotent',async()=>{
 const versions=new Map<string,string>();
 const queries:string[]=[];
 const db={
  transaction:async(run:(client:{query:(sql:string,args?:readonly unknown[])=>Promise<{rows:Array<{checksum:string}>}>})=>Promise<void>)=>
   run({query:async(sql:string,args:readonly unknown[]=[])=>{
    queries.push(sql);
    if(sql.includes('SELECT checksum FROM md_system_migrations')){
     const checksum=versions.get(String(args[0]));
     return {rows:checksum?[{checksum}]:[]};
    }
    if(sql.includes('INSERT INTO md_system_migrations')){
     versions.set(String(args[0]),String(args[1]));
    }
    return {rows:[]};
   }})
 } as unknown as SqlPersistence;
 await applySystemMigrations(db);
 const numberOfDDL=queries.filter(q=>q.includes('CREATE TABLE IF NOT EXISTS md_named_credentials')).length;
 assert.ok(queries.some(q=>q.includes('CREATE TABLE IF NOT EXISTS md_tenant_settings')));
 assert.equal(versions.size,3);
 await applySystemMigrations(db);
 assert.equal(queries.filter(q=>q.includes('CREATE TABLE IF NOT EXISTS md_named_credentials')).length,numberOfDDL);
 assert.equal(versions.size,3);
});
