import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import {
  QUOTATION_OBJECTS,QUOTATION_OBJECTS_SEED_VERSION,
  seedQuotationObjects,seedQuotationObjectsForExistingTenants
} from '../../src/app-seeders/core-quotation-objects.js';

test('quotation core objects reuse Invoice, Product, Customer, Contact and Account',()=>{
  assert.deepEqual(QUOTATION_OBJECTS.map(o=>o.apiName),['Quotation','QuotationLine']);
  const quotation=QUOTATION_OBJECTS[0];
  const line=QUOTATION_OBJECTS[1];
  assert.ok(quotation.fields.some(f=>f.apiName==='Customer'&&'relatedObject' in f&&f.relatedObject==='Customer'));
  assert.ok(quotation.fields.some(f=>f.apiName==='RelatedInvoice'&&'relatedObject' in f&&f.relatedObject==='Invoice'));
  assert.ok(line.fields.some(f=>f.apiName==='Quotation'&&'relatedObject' in f&&f.relatedObject==='Quotation'));
  assert.ok(line.fields.some(f=>f.apiName==='Product'&&'relatedObject' in f&&f.relatedObject==='Product'));
  for(const o of QUOTATION_OBJECTS) {
    assert.equal(new Set(o.fields.map(f=>f.apiName)).size,o.fields.length);
  }
});

test('core quotation seeder inserts metadata objects before fields without overwriting tenant edits',async()=>{
  const inserts:Array<{sql:string;args:unknown[]}>= [];
  const client={query:async(sql:string,args:unknown[])=>{
    inserts.push({sql,args});
    return {rows:[],rowCount:1};
  }} as unknown as PoolClient;
  await seedQuotationObjects(client,'tenant-quote');
  assert.equal(inserts.length,2+QUOTATION_OBJECTS.reduce((n,o)=>n+o.fields.length,0));
  assert.ok(inserts.slice(0,2).every(x=>x.sql.includes('md_object_definitions')));
  assert.ok(inserts.slice(2).every(x=>x.sql.includes('md_field_definitions')));
  for(const {sql,args} of inserts) {
    assert.equal(args[0],'tenant-quote');
    assert.match(sql,/ON CONFLICT.*DO NOTHING/);
    assert.doesNotMatch(sql,/INSERT INTO md_records|INSERT INTO md_record_values/);
  }
});

test('quotation backfill is versioned, idempotent and includes each existing tenant',async()=>{
  const checksum=createHash('sha256').update(JSON.stringify(QUOTATION_OBJECTS)).digest('hex');
  const queries:Array<{sql:string;args:unknown[]}>= [];
  let applied=false;
  const client={query:async(sql:string,args:unknown[]=[])=>{
    queries.push({sql,args});
    if(sql.startsWith('SELECT checksum FROM md_system_migrations'))
      return {rows:applied?[{checksum}]:[]};
    if(sql.startsWith('SELECT id FROM md_tenants'))
      return {rows:[{id:'tenant-a'},{id:'tenant-b'}]};
    if(sql.startsWith('INSERT INTO md_system_migrations')) {
      assert.deepEqual(args,[QUOTATION_OBJECTS_SEED_VERSION,checksum]);
      applied=true;
    }
    return {rows:[],rowCount:1};
  }};
  const db={transaction:async(fn:(client:typeof client)=>Promise<number>)=>fn(client)};
  assert.equal(await seedQuotationObjectsForExistingTenants(db as never),2);
  assert.equal(await seedQuotationObjectsForExistingTenants(db as never),2);
  assert.equal(queries.filter(x=>x.sql.startsWith('INSERT INTO md_system_migrations')).length,1);
  assert.equal(queries.filter(x=>x.sql.includes('INSERT INTO md_object_definitions')).length,8);
});

test('a changed checksum requires a new quotation core seeder version',async()=>{
  const client={query:async(sql:string)=>{
    if(sql.startsWith('SELECT checksum FROM md_system_migrations'))
      return {rows:[{checksum:'not-current'}]};
    return {rows:[]};
  }};
  const db={transaction:async(fn:(client:typeof client)=>Promise<number>)=>fn(client)};
  await assert.rejects(seedQuotationObjectsForExistingTenants(db as never),/new version/);
});
