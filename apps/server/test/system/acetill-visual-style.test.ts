import assert from 'node:assert/strict';
import test from 'node:test';
import {loadAcetillVisualStyles,saveAcetillVisualStyles,validateAcetillVisualStyles}
 from '../../src/system-support/acetill-visual-style-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

test('tenant-scoped SQL only stores visual overrides and preserves original application',async()=>{
 const queries:{sql:string;args:unknown[]}[]=[];
 const db={query:async(sql:string,args:unknown[])=>{
   queries.push({sql,args});
   return {rows:sql.startsWith('INSERT')?[]:[{properties:{styles:{cash:{color:'#ffffff'}}}}]};
 }} as unknown as SqlPersistence;
 const existing=await loadAcetillVisualStyles(db,'tenant-a');
 assert.deepEqual(existing,{cash:{color:'#ffffff'}});
 const saved=await saveAcetillVisualStyles(db,'tenant-b',{cash:{color:'#121212',width:'220px'}});
 assert.deepEqual(saved,{cash:{color:'#121212',width:'220px'}});
 assert.deepEqual(queries[0].args,['tenant-a']);
 assert.equal(queries[1].args[0],'tenant-b');
 assert.match(queries[1].sql,/md_system_definitions/);
 assert.doesNotMatch(queries[1].sql,/md_flow_definitions|md_page_components|DELETE FROM/);
});
test('style save rejects CSS injection and unregistered elements',()=>{
 assert.throws(()=>validateAcetillVisualStyles({cash:{backgroundColor:'url(javascript:alert(1))'}}));
 assert.throws(()=>validateAcetillVisualStyles({notRegistered:{color:'red'}}));
 assert.throws(()=>validateAcetillVisualStyles({cash:{position:'fixed'}}));
 assert.deepEqual(validateAcetillVisualStyles({cash:{backgroundColor:'#123456'}}),
   {cash:{backgroundColor:'#123456'}});
});
