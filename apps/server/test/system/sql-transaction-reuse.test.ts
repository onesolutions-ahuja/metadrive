import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SqlPersistence} from '../../src/system-files/sql-persistence.js';

test('nested record queries reuse the transaction connection',async()=>{
 const db=new SqlPersistence('postgresql://test:test@localhost:5432/test');
 const commands:string[]=[];
 const client={query:async(sql:string)=>{commands.push(sql);return {rows:[{allowed:true}],rowCount:1};},release:()=>commands.push('RELEASE CLIENT')};
 let acquisitions=0;
 (db.pool as unknown as {connect:()=>Promise<typeof client>}).connect=async()=>{acquisitions++;return client;};
 (db.pool as unknown as {query:()=>never}).query=()=>{throw Error('Pool query within transaction');};
 await db.transaction(async()=>{
   await db.query('SELECT 1');
   await db.transaction(async()=>{await db.query('SELECT 2');});
 });
 assert.equal(acquisitions,1);
 assert.deepEqual(commands.filter(x=>x==='SELECT 1'||x==='SELECT 2'),['SELECT 1','SELECT 2']);
 assert.equal(commands.filter(x=>x==='COMMIT').length,1);
 assert.equal(commands.filter(x=>x==='RELEASE CLIENT').length,1);
});

test('failed nested operation rolls back to savepoint and outer operation continues',async()=>{
 const db=new SqlPersistence('postgresql://test:test@localhost:5432/test');
 const commands:string[]=[];
 const client={query:async(sql:string)=>{commands.push(sql);return {rows:[],rowCount:0};},release:()=>{}};
 (db.pool as unknown as {connect:()=>Promise<typeof client>}).connect=async()=>client;
 await db.transaction(async()=>{
   await assert.rejects(db.transaction(async()=>{throw Error('nested failure');}),/nested failure/);
   await db.query('SELECT 3');
 });
 assert(commands.some(x=>x.startsWith('ROLLBACK TO SAVEPOINT md_nested_')));
 assert(commands.includes('COMMIT'));
 assert(commands.includes('SELECT 3'));
});
