import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {persistFlowInterviewPause} from '../../src/system-files/flow-interview-persistence.js';
import type {PoolClient} from 'pg';

test('fresh schema and upgrade migration constrain durable Flow record collection indexes',()=>{
 const schema=readFileSync(new URL('../../src/system-files/schema.sql',import.meta.url),'utf8');
 const migration=readFileSync(new URL(
  '../../src/system-support/migrations/20261114-flow-interview-record-bounds.sql',import.meta.url),'utf8');
 assert.match(schema,/md_flow_interview_records[\s\S]*?sort_order integer NOT NULL CHECK\(sort_order BETWEEN 0 AND 199\)/);
 assert.match(migration,/sort_order>199/);
 assert.match(migration,/CHECK \(sort_order BETWEEN 0 AND 199\)/);
});

test('durable Flow record resources reject more than 200 rows before persistence',async()=>{
 const statements:string[]=[];
 const client={query:async(sql:string)=>{statements.push(sql);return {rows:[]}}} as unknown as PoolClient;
 const values=Array.from({length:201},(_,index)=>({Id:String(index)}));
 await assert.rejects(()=>persistFlowInterviewPause(client,'tenant','run',1,[],1,new Map(),
  {accounts:values},[{name:'accounts',type:'Record Collection',dataType:'Account'}]),
 /200-record limit/);
});
