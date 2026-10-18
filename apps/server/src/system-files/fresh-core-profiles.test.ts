import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FRESH_CORE_PROFILES,FRESH_CORE_PROFILES as profiles,ADMIN_PROTECTED_RESOURCES,seedFreshCoreProfiles} from './fresh-core-profiles.js';
import {FRESH_CORE_OBJECTS} from './fresh-core-objects.js';
test('fresh profiles have exactly the three approved permission sets',()=>{
 assert.deepEqual(profiles.map(p=>[p.label,p.permissionSet]),[
 ['System Administrator','Admin'],['Developer','OneEngineDeveloper'],['Standard User','PermissionSet1']]);
});
test('fresh permission grants distinguish admin exceptions, developer CRUD and standard create/read',async()=>{
 const rules:Record<string,Array<{resource:string;action:string;effect:string}>>={};
 let active='';
 const client={query:async(sql:string,params:unknown[])=>{
  if(sql.includes('INSERT INTO md_permission_sets')){active=params[1] as string;return {rows:[{id:active}]};}
  if(sql.includes('INSERT INTO md_permission_rules')){const key=params[1] as string;(rules[key]??=[]).push({resource:params[2] as string,action:params[3] as string,effect:params[4] as string});return {rows:[]};}
  throw Error('Unexpected query: '+sql);
 }};
 await seedFreshCoreProfiles(client as never,'tenant');
 assert.ok(rules.Admin.some(r=>r.resource==='*'&&r.action==='*'&&r.effect==='allow'));
 for(const resource of ADMIN_PROTECTED_RESOURCES)
  assert.ok(rules.Admin.some(r=>r.resource===resource&&r.action==='*'&&r.effect==='deny'));
 for(const object of FRESH_CORE_OBJECTS){
  assert.deepEqual(rules.OneEngineDeveloper.filter(r=>r.resource===object.apiName).map(r=>r.action),
   ['read','create','edit','delete']);
  assert.deepEqual(rules.PermissionSet1.filter(r=>r.resource===object.apiName).map(r=>r.action),['read','create']);
 }
 assert.equal(rules.OneEngineDeveloper.some(r=>r.resource==='*'),false);
 assert.equal(rules.PermissionSet1.some(r=>r.action==='delete'),false);
});
