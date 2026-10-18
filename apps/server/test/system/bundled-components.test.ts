import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { PoolClient } from 'pg';
import { BUNDLED_COMPONENTS,seedFreshBundledComponents } from '../../src/app-seeders/bundled-components.js';

test('SQL component seed matches the reviewed One manifest without duplicates', async()=>{
  const catalog=JSON.parse(await readFile(new URL('../../../web/src/one/manifest.json',import.meta.url),'utf8')) as {components:string[]};
  assert.deepEqual([...BUNDLED_COMPONENTS],catalog.components.map(path=>path.split('/')[0]));
  assert.ok(BUNDLED_COMPONENTS.includes('OneShoppingCart'));
  assert.ok(BUNDLED_COMPONENTS.includes('OneItemGrid'));
});

test('bundled component seed never overwrites tenant customisations and is tenant scoped',async()=>{
  const writes:Array<{sql:string;args:unknown[]}>=[]; 
  const client={query:async(sql:string,args:unknown[])=>{writes.push({sql,args});return {rows:[]};}} as unknown as PoolClient;
  await seedFreshBundledComponents(client,'tenant-a');
  assert.equal(writes.length,BUNDLED_COMPONENTS.length);
  for(const write of writes){
    assert.match(write.sql,/ON CONFLICT\(tenant_id,api_name\) DO NOTHING/);
    assert.equal(write.args[0],'tenant-a');
    assert.equal(write.args[2],'one-bundled:'+write.args[1]);
  }
});

test('system startup wires the idempotent existing-tenant component and Product image seeders', async()=>{
  const source=await readFile(new URL('../../src/system-support/server.ts',import.meta.url),'utf8');
  const startup=source.slice(source.indexOf('export async function startSystemServer()'));
  assert.match(startup,/await seedBundledComponentsForExistingTenants\(db\)/);
  assert.match(startup,/await seedProductImageFieldForExistingTenants\(db\)/);
});
