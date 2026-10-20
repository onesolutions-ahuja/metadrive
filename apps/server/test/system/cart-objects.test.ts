import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import {CART_OBJECTS,seedCartObjects,seedCartObjectsForExistingTenants} from '../../src/app-seeders/cart-objects.js';

test('Cart and CartLine metadata have a usable parent and Product lookup',()=>{
  assert.deepEqual(CART_OBJECTS.map(object=>object.apiName),['Cart','CartLine']);
  const lines=CART_OBJECTS[1].fields;
  assert.ok(lines.some(field=>field.apiName==='Cart' && 'relatedObject' in field && field.relatedObject==='Cart'));
  assert.ok(lines.some(field=>field.apiName==='Product' && 'relatedObject' in field && field.relatedObject==='Product'));
});

test('cart seeder inserts objects before fields with non-destructive conflicts',async()=>{
  const statements:string[]=[];
  const client={query:async(sql:string,args:unknown[])=>{
    statements.push(sql);
    assert.equal(args[0],'tenant-1');
    return {rows:[]};
  }} as unknown as PoolClient;
  await seedCartObjects(client,'tenant-1');
  assert.equal(statements.length,2+CART_OBJECTS.reduce((n,o)=>n+o.fields.length,0));
  assert.ok(statements.slice(0,2).every(sql=>sql.includes('md_object_definitions') && sql.includes('DO NOTHING')));
  assert.ok(statements.slice(2).every(sql=>sql.includes('md_field_definitions') && sql.includes('DO NOTHING')));
});

test('existing tenant backfill runs for each tenant',async()=>{
  const calls:Array<{sql:string;args:unknown[]}>= [];
  const client={query:async(sql:string,args:unknown[]=[])=>{
    calls.push({sql,args});
    if(sql.includes('SELECT id FROM md_tenants')) return {rows:[{id:'t1'},{id:'t2'}]};
    return {rows:[]};
  }};
  const db={transaction:async(fn:(client:unknown)=>Promise<number>)=>fn(client)};
  const count=await seedCartObjectsForExistingTenants(db as any);
  assert.equal(count,2);
  assert.equal(calls.filter(x=>x.sql.includes('md_object_definitions')).length,4);
});
