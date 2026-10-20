import test from 'node:test';
import assert from 'node:assert/strict';
import {assertDeletionAllowed} from '../../src/relationship-engine/ReferentialIntegrityGuard.js';
import {enforceMasterDetailReparenting} from '../../src/relationship-engine/MasterDetailManager.js';
import {assertLookupTargetExists} from '../../src/relationship-engine/LookupResolver.js';
import {findRelatedRecordIds} from '../../src/relationship-engine/RelatedRecordsQuery.js';

test('required and restricted lookup references stop deletion',()=>{
 assert.throws(()=>assertDeletionAllowed([{relationship_type:'Lookup',delete_behavior:'Restrict',required:false}]),/restricted/);
 assert.throws(()=>assertDeletionAllowed([{relationship_type:'Lookup',delete_behavior:null,required:true}]),/restricted/);
 assert.doesNotThrow(()=>assertDeletionAllowed([{relationship_type:'Master-Detail',delete_behavior:null,required:true}]));
});
test('master-detail reparenting rules retain shared Field Engine behavior',()=>{
 assert.throws(()=>enforceMasterDetailReparenting('old','new','Parent',false),/does not allow reparenting/);
 assert.doesNotThrow(()=>enforceMasterDetailReparenting('old','new','Parent',true));
});
test('lookup resolver scopes SQL to caller tenant and rejects missing targets',async()=>{
 const queries:Array<{sql:string;params:unknown[]}>=[];const fake={query:async(sql:string,params:unknown[])=>{queries.push({sql,params});return {rowCount:0};}};
 await assert.rejects(()=>assertLookupTargetExists(fake as never,'tenant-a','Account','record-a','Parent'),/Invalid relationship target/);
 assert.ok(queries[0].sql.includes('tenant_id=$1'));
 assert.deepEqual(queries[0].params,['tenant-a','Account','record-a']);
});
test('related record queries scope parent and child within tenant',async()=>{
 const queries:Array<{sql:string;params:unknown[]}>=[];const fake={query:async(sql:string,params:unknown[])=>{queries.push({sql,params});return {rows:[{id:'child-a'}]};}};
 assert.deepEqual(await findRelatedRecordIds(fake as never,'tenant-a','Line','Parent','record-a'),['child-a']);
 assert.ok(queries[0].sql.includes('r.tenant_id=$1'));
 assert.deepEqual(queries[0].params,['tenant-a','Line','Parent','record-a']);
});
