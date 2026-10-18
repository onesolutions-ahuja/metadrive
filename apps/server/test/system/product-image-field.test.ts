import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PoolClient } from 'pg';
import { seedFreshProductImageField,PRODUCT_IMAGE_FIELD } from '../../src/app-seeders/product-image-field.js';

test('Product ImageUrl shared metadata is additive and preserves existing field definitions',async()=>{
  const queries:Array<{sql:string;args:unknown[]}>=[]; 
  const client={query:async(sql:string,args:unknown[])=>{queries.push({sql,args});return {rows:[]};}} as unknown as PoolClient;
  await seedFreshProductImageField(client,'tenant-a');
  assert.equal(queries.length,1);
  assert.equal(queries[0].args[0],'tenant-a');
  assert.equal(queries[0].args[1],'Product');
  assert.equal(queries[0].args[2],PRODUCT_IMAGE_FIELD.apiName);
  assert.equal(queries[0].args[5],2048);
  assert.match(queries[0].sql,/ON CONFLICT\(tenant_id,object_api,api_name\) DO NOTHING/);
  assert.doesNotMatch(queries[0].sql,/UPDATE md_field_definitions/);
});
