import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTenantAppMetadata} from '../../src/app-runtime/AppMetadataResolver.js';
import {loadActivatedAppModule} from '../../src/app-runtime/LazyModuleLoader.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

test('tenant app resolver returns no navigation and avoids further queries without entitled installations',async()=>{
 let calls=0;
 const db={query:async()=>{calls++;return {rows:[]};}} as unknown as SqlPersistence;
 assert.deepEqual(await resolveTenantAppMetadata(db,'tenant-a'),[]);
 assert.equal(calls,1);
});
test('tenant app resolver never mixes navigation or utilities across app IDs',async()=>{
 const calls:unknown[][]=[];
 const db={query:async(_sql:string,params:unknown[])=>{
  calls.push(params);
  if(calls.length===1)return {rows:[{id:'app-a',api_name:'A',label:'App A',description:null,brand_color:null,revision:null}]};
  if(_sql.includes('md_tenant_app_navigation'))return {rows:[
   {app_id:'app-a',entry_type:'Object',api_name:'Account',sort_order:1},
   {app_id:'app-b',entry_type:'Object',api_name:'Secret',sort_order:2}]};
  return {rows:[{app_id:'app-a',utility_name:'Notes'},{app_id:'app-b',utility_name:'History'}]};
 }} as unknown as SqlPersistence;
 const apps=await resolveTenantAppMetadata(db,'tenant-a');
 assert.equal(apps.length,1);
 assert.deepEqual(apps[0].navigationItems,['Account']);
 assert.deepEqual(apps[0].utilityItems,['Notes']);
 assert.deepEqual(calls[1],['tenant-a',['app-a']]);
});
test('lazy app loader never imports uninstalled, unlicensed, inactive or unauthorized modules',async()=>{
 let loads=0;
 const load=async()=>{loads++;return {ready:true};};
 for(const invalid of [
  {installed:false,entitled:true,active:true,authorized:true},
  {installed:true,entitled:false,active:true,authorized:true},
  {installed:true,entitled:true,active:false,authorized:true},
  {installed:true,entitled:true,active:true,authorized:false}
 ]){
  await assert.rejects(()=>loadActivatedAppModule(invalid,load),/unavailable/);
 }
 assert.equal(loads,0);
 assert.deepEqual(await loadActivatedAppModule({installed:true,entitled:true,active:true,authorized:true},load),{ready:true});
 assert.equal(loads,1);
});
