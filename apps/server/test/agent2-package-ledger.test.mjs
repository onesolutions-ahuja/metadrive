import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVersionedSeed, packageChecksum} from '../src/seeders/sql-package-ledger.mjs';

test('agent2: checksum stable across object key ordering',()=>{
  assert.equal(packageChecksum({a:1,b:{x:2,y:3}}),packageChecksum({b:{y:3,x:2},a:1}));
});
test('agent2: first application records package after metadata callback',async()=>{
  const calls=[];
  const client={query:async(sql,args)=>{
    calls.push({sql,args});
    if(sql.startsWith('SELECT package_version'))return {rows:[]};
    return {rows:[]};
  }};
  const result=await applyVersionedSeed(client,{
    tenantId:'t1',kind:'shared',key:'common',version:'1.0.0',definition:{objects:[]},
    apply:async()=>{calls.push({sql:'metadata applied'});}
  });
  assert.equal(result.changed,true);
  assert.ok(calls.findIndex(x=>x.sql==='metadata applied') <
    calls.findIndex(x=>x.sql.startsWith('INSERT INTO md_seed_package_versions')));
});
test('agent2: unchanged package is idempotent',async()=>{
  const def={objects:[]};let applied=false;
  const client={query:async(sql)=>sql.startsWith('SELECT package_version')
    ? {rows:[{package_version:'1',definition_checksum:packageChecksum(def)}]}:{rows:[]}};
  const result=await applyVersionedSeed(client,{
    tenantId:'t1',kind:'core',key:'core',version:'1',definition:def,apply:async()=>{applied=true;}});
  assert.equal(result.changed,false);assert.equal(applied,false);
});
test('agent2: changed checksum with identical version fails closed',async()=>{
  const client={query:async(sql)=>sql.startsWith('SELECT package_version')
    ? {rows:[{package_version:'1',definition_checksum:'a'.repeat(64)}]}:{rows:[]}};
  await assert.rejects(applyVersionedSeed(client,{
    tenantId:'t1',kind:'app',key:'crm',version:'1',definition:{objects:[]},
    apply:async()=>{throw Error('must not execute');}}),/reused/);
});
test('agent2: failed metadata does not record a successful version',async()=>{
  const statements=[];const client={query:async(sql)=>{statements.push(sql);
    return {rows:[]};}};
  await assert.rejects(applyVersionedSeed(client,{
    tenantId:'t1',kind:'app',key:'crm',version:'2',definition:{objects:[]},
    apply:async()=>{throw Error('migration failed');}}),/migration failed/);
  assert.equal(statements.some(sql=>sql.startsWith('INSERT INTO md_seed_package_versions')),false);
});
