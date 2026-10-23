import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import {LOCATION_SRN_FIELDS,seedLocationSrnMetadata,seedAcetillDefaultLocation} from '../../src/app-seeders/core-location-srn.js';

test('Location is shared and SRN references the original Invoice',()=>{
  assert.deepEqual(LOCATION_SRN_FIELDS.map(x=>x.object),['Location','Invoice','Purchase']);
  const invoice=LOCATION_SRN_FIELDS[1];
  assert.ok(invoice.fields.some(f=>f.api==='InvoiceType'));
  assert.ok(invoice.fields.some(f=>f.api==='ReferenceInvoice'&&'related' in f&&f.related==='Invoice'));
  assert.ok(invoice.fields.some(f=>f.api==='Location'&&'related' in f&&f.related==='Location'));
});
test('metadata seeding is additive and creates no business records',async()=>{
  const sql:string[]=[];
  const client={query:async(s:string)=>{sql.push(s);return {rows:[],rowCount:0}}} as unknown as PoolClient;
  await seedLocationSrnMetadata(client,'tenant');
  assert.equal(sql.filter(s=>s.includes('INSERT INTO md_object_definitions')).length,1);
  assert.equal(sql.filter(s=>s.includes('INSERT INTO md_field_definitions')).length,LOCATION_SRN_FIELDS.reduce((n,o)=>n+o.fields.length,0));
  assert.ok(sql.every(s=>s.includes('ON CONFLICT')));
  assert.ok(!sql.some(s=>s.includes('INSERT INTO md_records')));
});
test('Acetill creates Store1 once and never overwrites an existing store',async()=>{
  let present=false;
  const sql:string[]=[];
  const client={query:async(s:string)=>{
    sql.push(s);
    if(s.includes('SELECT 1 FROM md_records'))return {rows:present?[{}]:[],rowCount:present?1:0};
    if(s.includes('INSERT INTO md_records')){present=true;return {rows:[{id:'location1'}],rowCount:1};}
    return {rows:[],rowCount:1};
  }} as unknown as PoolClient;
  await seedAcetillDefaultLocation(client,'tenant');
  await seedAcetillDefaultLocation(client,'tenant');
  assert.equal(sql.filter(s=>s.includes('INSERT INTO md_records')).length,1);
  assert.equal(sql.filter(s=>s.includes('INSERT INTO md_record_values')).length,1);
});
