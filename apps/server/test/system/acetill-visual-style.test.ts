import assert from 'node:assert/strict';
import test from 'node:test';
import {loadAcetillVisualStyles,saveAcetillVisualStyles,validateAcetillVisualStyles}
 from '../../src/system-support/acetill-visual-style-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

test('the live terminal only reads published styles; draft editor stays isolated',async()=>{
 const queries:{sql:string;args:unknown[]}[]=[];
 const db={query:async(sql:string,args:unknown[])=>{
   queries.push({sql,args});
   return {rows:sql.startsWith('INSERT')?[]:[{
     draft_styles:{cash:{color:'#ffffff'}},
     published_styles:{card:{backgroundColor:'#121212'}}
   }]};
 }} as unknown as SqlPersistence;
 const live=await loadAcetillVisualStyles(db,'tenant-a');
 const draft=await loadAcetillVisualStyles(db,'tenant-a','draft');
 assert.deepEqual(live,{card:{backgroundColor:'#121212'}});
 assert.deepEqual(draft,{cash:{color:'#ffffff'}});
 await saveAcetillVisualStyles(db,'tenant-a',{cash:{width:'220px'}});
 assert.match(queries[2].sql,/INSERT INTO md_acetill_visual_styles\(tenant_id,draft_styles\)/);
 assert.doesNotMatch(queries[2].sql,/published_styles|md_system_definitions|DELETE FROM/);
 assert.deepEqual(queries[2].args,['tenant-a',JSON.stringify({cash:{width:'220px'}})]);
});
test('style save rejects CSS injection and unregistered elements',()=>{
 assert.throws(()=>validateAcetillVisualStyles({cash:{backgroundColor:'url(javascript:alert(1))'}}));
 assert.throws(()=>validateAcetillVisualStyles({notRegistered:{color:'red'}}));
 assert.throws(()=>validateAcetillVisualStyles({cash:{position:'fixed'}}));
 assert.deepEqual(validateAcetillVisualStyles({cash:{backgroundColor:'#123456'}}),
   {cash:{backgroundColor:'#123456'}});
});
