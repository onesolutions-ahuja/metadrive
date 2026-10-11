// Runs ONLY against an ephemeral local PostgreSQL test service. Rolls back all DDL and rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {planNormalizedObjectTable} from '../src/normalized-object-schema.mjs';
import {sqlCreateRecord,sqlGetRecord,sqlUpdateRecord,sqlDeleteRecord} from '../src/normalized-record-store.mjs';

const uri=process.env.METADRIVE_TEST_DATABASE_URL;
test('typed physical tables, registry FKs, and SQL CRUD work transactionally without JSONB',{
  skip:!uri,timeout:30000
},async()=>{
  const url=new URL(uri);
  assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname),'Only local PostgreSQL is permitted for schema integration testing');
  assert.equal(url.pathname,'/postgres');
  const client=new pg.Client({connectionString:uri,ssl:false});
  await client.connect();
  let began=false;
  try {
    await client.query('BEGIN'); began=true;
    await client.query('CREATE TABLE metadrive_rel_tenants (tenant_id TEXT PRIMARY KEY)');
    await client.query("INSERT INTO metadrive_rel_tenants(tenant_id) VALUES ('sandbox')");
    const ddl=await readFile(new URL('../sql/normalized-registry-v2.sql',import.meta.url),'utf8');
    await client.query(ddl);
    const objectId='9d0584f2-6b05-4e79-bc6c-06aecf8db7a0';
    const priceId='9d0584f2-6b05-4e79-bc6c-06aecf8db7a1';
    const nameId='9d0584f2-6b05-4e79-bc6c-06aecf8db7a2';
    const object={apiName:'Catalog__c',fields:[
      {apiName:'Name',dataType:'Text(80)'},{apiName:'Price__c',dataType:'Currency(16, 2)'}
    ]};
    const table=planNormalizedObjectTable(object,{objectId,fields:{
      Name:{fieldId:nameId},Price__c:{fieldId:priceId}
    }});
    await client.query(table.createTable);
    for(const statement of table.addColumns) await client.query(statement);
    await client.query('INSERT INTO md_v2_object_registry (object_id,tenant_id,api_name,object_label,physical_table) VALUES ($1,$2,$3,$4,$5)',
      [objectId,'sandbox','Catalog__c','Catalog',table.table]);
    for(const col of table.columns) {
      await client.query('INSERT INTO md_v2_field_registry(field_id,object_id,api_name,field_label,source_data_type,physical_column) VALUES ($1,$2,$3,$4,$5,$6)',
        [col.fieldId,objectId,col.apiName,col.apiName,col.apiName==='Name'?'Text(80)':'Currency(16, 2)',col.column]);
    }
    const allow=async()=>true;
    const context={tenantId:'sandbox',objectId,recordId:'rec-1',authorize:allow};
    const created=await sqlCreateRecord(client,{...context,values:{Name:'Item A',Price__c:'4.99'}});
    assert.equal(created.version,1);
    const initial=await sqlGetRecord(client,context);
    assert.equal(initial.values.Name,'Item A');
    assert.equal(initial.values.Price__c,'4.99');
    assert.equal(initial.version,1);
    await assert.rejects(sqlCreateRecord(client,{...context,recordId:'rec-denied',values:{Name:'Blocked'},authorize:async()=>false}),/Access denied/);
    await assert.rejects(sqlUpdateRecord(client,{...context,expectedVersion:0,values:{Price__c:'9.99'}}),/version is mandatory/);
    const updated=await sqlUpdateRecord(client,{...context,expectedVersion:1,values:{Price__c:'6.25'},unsetFields:['Name']});
    assert.equal(updated.version,2);
    const current=await sqlGetRecord(client,context);
    assert.equal(current.values.Price__c,'6.25');
    assert.equal(Object.prototype.hasOwnProperty.call(current.values,'Name'),false,'Removed field must be absent, not null');
    await assert.rejects(sqlUpdateRecord(client,{...context,expectedVersion:1,values:{Price__c:'9.99'}}),/version conflict/);
    const selected=await client.query('SELECT * FROM '+table.table+' WHERE tenant_id=$1 AND record_id=$2',['sandbox','rec-1']);
    assert.equal(selected.rows.length,1);
    assert.equal(selected.rows[0][table.columns[1].column],'6.25');
    assert.equal(Number(selected.rows[0].record_version),2);
    await assert.rejects(sqlDeleteRecord(client,{...context,expectedVersion:1}),/version conflict/);
    const removed=await sqlDeleteRecord(client,{...context,expectedVersion:2});
    assert.equal(removed.deleted,true);
    assert.equal(await sqlGetRecord(client,context),null);
    const types=await client.query('SELECT column_name,data_type FROM information_schema.columns WHERE table_name=$1',[table.table]);
    assert.ok(types.rows.some(r=>r.column_name===table.columns[1].column&&r.data_type==='numeric'));
    assert.ok(types.rows.every(r=>r.data_type!=='jsonb'));
    await assert.rejects(client.query('INSERT INTO md_v2_field_registry(field_id,object_id,api_name,field_label,source_data_type,physical_column) VALUES ($1,$2,$3,$4,$5,$6)',
      ['9d0584f2-6b05-4e79-bc6c-06aecf8db7af','00000000-0000-4000-8000-000000000000','bad','Bad','Text','x']), /foreign key/i);
  } finally {
    if (began) await client.query('ROLLBACK');
    await client.end();
  }
});