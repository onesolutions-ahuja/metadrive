import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RecordMatching,DuplicateMatchError} from '../../src/system-files/record-matching.js';
const fixture=(action:'Alert'|'Block',visibleRows:{id:string}[]=[])=>{
 const sql:string[]=[];
 const client={query:async(query:string)=>{
  sql.push(query);
  if(query.includes('FROM md_matching_rules'))return {rows:[{api_name:'EmailMatch',match_mode:'All',action}]};
  if(query.includes('FROM md_matching_rule_fields'))return {rows:[{rule_api:'EmailMatch',field_api:'Email',case_sensitive:false}]};
  if(query.includes('FROM md_records r'))return {rows:visibleRows};
  return {rows:[]};
 }} as never;
 const rbac={require:async()=>undefined} as never;
 return {engine:new RecordMatching(rbac),client,sql};
};
test('matching evaluates same-tenant email field and blocks duplicate saves',async()=>{
 const f=fixture('Block',[{id:'00000000-0000-4000-8000-000000000003'}]);
 await assert.rejects(()=>f.engine.check(f.client,'tenant','user','Contact',{Email:'hi@example.com'}),
  (error:unknown)=>error instanceof DuplicateMatchError&&error.ruleApi==='EmailMatch');
 assert.ok(f.sql.some(s=>s.includes('lower(v.value_text)=lower(')));
});
test('alert rules return matches and insert tenant-scoped duplicate sets',async()=>{
 const id='00000000-0000-4000-8000-000000000003';
 const f=fixture('Alert',[{id}]);
 const matches=await f.engine.check(f.client,'tenant','user','Contact',{Email:'hi@example.com'});
 assert.deepEqual(matches,[{ruleApi:'EmailMatch',recordId:id}]);
 await f.engine.save(f.client,'tenant','Contact','00000000-0000-4000-8000-000000000004',matches);
 assert.ok(f.sql.some(s=>s.includes('INSERT INTO md_duplicate_record_sets')));
});
test('blank values do not create false duplicate matches',async()=>{
 const f=fixture('Block',[{id:'other'}]);
 assert.deepEqual(await f.engine.check(f.client,'tenant','user','Contact',{Email:' '}),[]);
 assert.ok(!f.sql.some(s=>s.includes('FROM md_records r')));
});
