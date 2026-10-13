import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { synchronizeTypedRecords, verifyTypedRecords } from '../src/normalized-typed-records.mjs';
import { physicalObjectTable, physicalTenantOwnerConstraint } from '../src/normalized-object-schema.mjs';

const databaseUrl=process.env.METADRIVE_TEST_DATABASE_URL;
test('typed metadata widening alters physical columns transactionally without losing records', {
  skip: !databaseUrl, timeout: 120000
}, async () => {
  const url=new URL(databaseUrl);
  assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname));
  assert.equal(url.pathname,'/postgres','Never use production for destructive migration tests');
  const database='md_widen_'+randomBytes(6).toString('hex');
  const target=new URL(databaseUrl);
  target.pathname='/'+database;
  const admin=new pg.Client({connectionString:databaseUrl,ssl:false});
  await admin.connect();
  try {
    await admin.query('CREATE DATABASE '+database);
    const client=new pg.Client({connectionString:target.toString(),ssl:false});
    await client.connect();
    try {
      await client.query('CREATE TABLE metadrive_rel_tenants(tenant_id TEXT PRIMARY KEY)');
      await client.query(await readFile(new URL('../sql/normalized-registry-v2.sql',import.meta.url),'utf8'));
      const original={
        tenants:{alpha:{
          objects:[{apiName:'Inventory__c',label:'Inventory',
            fields:[{apiName:'Code__c',label:'Code',dataType:'Text(48)'},
              {apiName:'Price__c',label:'Price',dataType:'Currency(10,2)'}]}],
          records:{Inventory__c:[{Id:'row-1',Code__c:'SKU-Original',Price__c:123456.12}]}
        }}
      };
      await client.query('BEGIN');
      await synchronizeTypedRecords(client,original);
      await client.query('COMMIT');
      await verifyTypedRecords(client,original);
      const upgraded=structuredClone(original);
      upgraded.tenants.alpha.objects[0].fields[0].dataType='Text(120)';
      upgraded.tenants.alpha.objects[0].fields[1].dataType='Currency(12,4)';
      upgraded.tenants.alpha.objects[0].fields[0].label='Product Code';
      upgraded.tenants.alpha.objects[0].label='Inventory Catalogue';
      // Simulate a pre-upgrade table that lacks the new owner constraint.
      const sourceObject=await client.query(
        "SELECT object_id FROM md_v2_object_registry WHERE tenant_id='alpha' AND api_name='Inventory__c'");
      const owner=physicalTenantOwnerConstraint(sourceObject.rows[0].object_id,'alpha');
      const sourceTable=physicalObjectTable(sourceObject.rows[0].object_id);
      await client.query('ALTER TABLE '+sourceTable+' DROP CONSTRAINT '+owner.name);
      await client.query("INSERT INTO "+sourceTable+"(tenant_id,record_id) VALUES('other-tenant','rogue')");
      await client.query('BEGIN');
      try {
        await assert.rejects(synchronizeTypedRecords(client,upgraded,original),/check constraint/);
      } finally {await client.query('ROLLBACK');}
      // No schema or record rewrite can happen while foreign records exist.
      await client.query("DELETE FROM "+sourceTable+" WHERE tenant_id='other-tenant'");
      await client.query('BEGIN');
      try {
        await synchronizeTypedRecords(client,upgraded,original);
        await verifyTypedRecords(client,upgraded);
        await client.query('COMMIT');
      } catch(error) {await client.query('ROLLBACK');throw error;}
      const objects=await client.query("SELECT object_id FROM md_v2_object_registry WHERE tenant_id='alpha' AND api_name='Inventory__c'");
      const table=physicalObjectTable(objects.rows[0].object_id);
      const objectLabel=await client.query('SELECT object_label FROM md_v2_object_registry WHERE object_id=$1',[objects.rows[0].object_id]);
      assert.equal(objectLabel.rows[0].object_label,'Inventory Catalogue');
      const validatedGuard=await client.query(
        'SELECT convalidated FROM pg_constraint WHERE conrelid=to_regclass($1) AND conname=$2',
        [table,owner.name]);
      assert.equal(validatedGuard.rows[0]?.convalidated,true);
      await assert.rejects(
        client.query('INSERT INTO '+table+' (tenant_id,record_id) VALUES($1,$2)',['other-tenant','bad']),
        /check constraint/,'Physical SQL table must never accept another tenant ID');
      const physical=await client.query('SELECT * FROM '+table+' WHERE tenant_id=$1',['alpha']);
      assert.equal(physical.rows.length,1);
      const columns=await client.query("SELECT data_type,character_maximum_length,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_name=$1 AND column_name IN (SELECT physical_column FROM md_v2_field_registry WHERE object_id=$2)",[table,objects.rows[0].object_id]);
      assert.ok(columns.rows.some(row=>row.character_maximum_length===120));
      assert.ok(columns.rows.some(row=>Number(row.numeric_precision)===12&&Number(row.numeric_scale)===4));
      const registry=await client.query("SELECT api_name,source_data_type,field_label FROM md_v2_field_registry WHERE object_id=$1 AND api_name='Code__c'",[objects.rows[0].object_id]);
      assert.equal(registry.rows[0].source_data_type,'Text(120)');
      assert.equal(registry.rows[0].field_label,'Product Code');
      const narrowed=structuredClone(upgraded);
      narrowed.tenants.alpha.objects[0].fields[0].dataType='Text(30)';
      await client.query('BEGIN');
      try {
        await assert.rejects(synchronizeTypedRecords(client,narrowed,upgraded),/narrowing or incompatible/);
      } finally {await client.query('ROLLBACK');}
      await verifyTypedRecords(client,upgraded);
      assert.equal((await client.query('SELECT count(*)::integer AS n FROM '+table)).rows[0].n,1);
    } finally {await client.end();}
  } finally {
    await admin.query('DROP DATABASE IF EXISTS '+database+' WITH (FORCE)');
    await admin.end();
  }
});
