import assert from 'node:assert/strict';
import {test} from 'node:test';
import {noCycles} from '../../src/system-support/rbac-validation.js';
import {RoleAdministration} from '../../src/system-support/role-administration.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
test('hierarchies reject missing parents and nested cycles',()=>{
 assert.throws(()=>noCycles([{id:'a',parents:['b']}]),/Unknown/);
 assert.throws(()=>noCycles([{id:'a',parents:['b']},{id:'b',parents:['a']}]),/Cyclic/);
 assert.doesNotThrow(()=>noCycles([{id:'a',parents:[]},{id:'b',parents:['a']},{id:'c',parents:['a']}]));
});
test('legacy role-only requests cannot silently discard the rest of an RBAC draft',async()=>{
 const db={} as SqlPersistence,rbac={require:async()=>{}} as unknown as RbacEngine;
 await assert.rejects(()=>new RoleAdministration(db,rbac).save('tenant','actor',{roles:[],users:[]}),/Invalid RBAC request/);
});
test('role edits require Security manage before validating input or touching SQL',async()=>{
 const db={} as SqlPersistence,rbac={require:async()=>{throw Error('Permission denied');}} as unknown as RbacEngine;
 await assert.rejects(()=>new RoleAdministration(db,rbac).save('tenant','actor',{}),/Permission denied/);
});
