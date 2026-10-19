import assert from 'node:assert/strict';
import {test} from 'node:test';
import {grantRules,displayRules,policySet} from '../../src/system-support/rbac-contract.js';
import {PermissionSetAdministration} from '../../src/system-support/permission-set-administration.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
const set=policySet.parse({id:'12345678-1234-4234-8234-123456789abc',apiName:'Cashier',label:'Cashier',
 systemPermissions:['flows:run'],objectPermissions:{Invoice:{create:true}},fieldPermissions:{'Invoice.Total':{read:true}}});
test('policy grants use the existing central executable resource contract',()=>{
 const rules=grantRules(set);
 assert.ok(rules.some(r=>r.resource==='Invoice'&&r.action==='create'));
 assert.ok(rules.some(r=>r.resource==='Invoice.Total'&&r.action==='read'));
 assert.ok(rules.some(r=>r.resource==='Flow'&&r.action==='execute'));
 assert.ok(!rules.some(r=>r.resource.startsWith('Object:')||r.resource.startsWith('Field:')));
 const contextGrant=grantRules({...set,systemPermissions:['flows:system-context']});
 assert.ok(contextGrant.some(r=>r.resource==='FlowDefinition'&&r.action==='system-context'
  &&r.effect==='allow'));
});
test('wildcard restrictions and restoration round-trip through displayed checkboxes',()=>{
 const rules=grantRules({...set,systemPermissions:['*:*','security:read','security:manage'],
  objectPermissions:{Invoice:{read:true,create:false}},fieldPermissions:{'Invoice.Total':{read:true,edit:false}}});
 assert.ok(rules.some(r=>r.resource==='Invoice'&&r.action==='create'&&r.effect==='deny'));
 const shown=displayRules(rules,['Invoice'],['Invoice.Total'],[],[]);
 assert.equal(shown.objectPermissions.Invoice.create,false);
 const restored=grantRules({...set,...shown,objectPermissions:{Invoice:{read:true,create:true}}});
 assert.ok(!restored.some(r=>r.resource==='Invoice'&&r.action==='create'&&r.effect==='deny'));
});
test('custom denies and scoped wildcard rules survive unrelated edits',()=>{
 const old=[{resource:'Flow:Checkout',action:'execute',effect:'deny' as const},
  {resource:'Custom',action:'*',effect:'allow' as const}];
 const shown=displayRules(old,[],[],[],[]);
 const saved=grantRules({...set,...shown});
 assert.ok(saved.some(r=>r.resource==='Flow:Checkout'&&r.effect==='deny'));
 assert.ok(saved.some(r=>r.resource==='Custom'&&r.action==='*'));
});
test('invalid field keys and actions fail closed',()=>{
 assert.throws(()=>grantRules({...set,fieldPermissions:{'Invoice..Total':{read:true}}}),/Invalid field/);
 assert.throws(()=>grantRules({...set,objectPermissions:{Invoice:{execute:true}}}),/Invalid object/);
});
test('permission-set writes require Security manage before SQL',async()=>{
 const rbac={require:async()=>{throw Error('Permission denied');}} as unknown as RbacEngine;
 await assert.rejects(()=>new PermissionSetAdministration({} as SqlPersistence,rbac).save('tenant','actor',{}),/Permission denied/);
});
