import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const connectionString=process.env.METADRIVE_TEST_DATABASE_URL;
test('MD07 component registry SQL is typed, relational, tenant-safe and reversible', {skip: !connectionString}, async () => {
  const db=new pg.Client({connectionString,ssl:false});
  const schema='md07_'+randomUUID().replaceAll('-','');
  await db.connect();
  try {
    await db.query('CREATE SCHEMA "'+schema+'"');
    await db.query('SET search_path TO "'+schema+'"');
    await db.query('CREATE TABLE metadrive_rel_tenants(tenant_id TEXT PRIMARY KEY)');
    const sql=await readFile(new URL('../sql/component-registry-v4.sql',import.meta.url),'utf8');
    await db.query(sql);
    await db.query(sql); // additive migration must be idempotent
    const columns=await db.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name LIKE 'md_v4_%'",[schema]);
    assert.ok(columns.rows.length > 20,'expected normalized component version and dependency tables');
    assert.ok(!columns.rows.some(row=>['json','jsonb'].includes(row.data_type)),'component SQL registry must contain no JSONB columns');
    await db.query("INSERT INTO metadrive_rel_tenants(tenant_id) VALUES('tenant_a'),('tenant_b')");
    const platform=randomUUID(), privateComponent=randomUUID();
    await db.query("INSERT INTO md_v4_components(component_id,api_name,registry_scope) VALUES($1,'Shared_Card','PLATFORM')",[platform]);
    await db.query("INSERT INTO md_v4_components(component_id,api_name,registry_scope,owner_tenant_id) VALUES($1,'Private_Card','TENANT','tenant_a')",[privateComponent]);
    await assert.rejects(db.query("INSERT INTO md_v4_components(component_id,api_name,registry_scope) VALUES($1,'Bad_Private','TENANT')",[randomUUID()]),/check constraint/i);
    await db.query("INSERT INTO md_v4_component_versions(component_id,version,label,source_jsx,source_css,compiled_js,scoped_css,width_default,height_default,width_min,height_min,status,author_id) VALUES($1,1,'Card','src-v1','','compiled-v1','',320,180,120,60,'PUBLISHED','test-user')",[privateComponent]);
    await db.query("INSERT INTO md_v4_component_versions(component_id,version,label,source_jsx,source_css,compiled_js,scoped_css,width_default,height_default,width_min,height_min,status,author_id) VALUES($1,2,'Card','src-v2','','compiled-v2','',320,180,120,60,'DRAFT','test-user')",[privateComponent]);
    await db.query("INSERT INTO md_v4_component_surfaces(component_id,version,surface) VALUES($1,1,'page'),($1,2,'page')",[privateComponent]);
    await db.query("INSERT INTO md_v4_component_dependencies(tenant_id,component_id,surface,owner_api_name,placement_id) VALUES('tenant_a',$1,'page','Demo_Page','placement_1')",[privateComponent]);
    await assert.rejects(db.query("INSERT INTO md_v4_component_dependencies(tenant_id,component_id,surface,owner_api_name,placement_id) VALUES('tenant_b',$1,'page','Foreign_Page','placement_2')",[privateComponent]),/Cross-tenant component reference rejected/);
    await db.query("INSERT INTO md_v4_component_dependencies(tenant_id,component_id,surface,owner_api_name,placement_id) VALUES('tenant_b',$1,'page','Public_Page','placement_3')",[platform]);
    await assert.rejects(db.query("DELETE FROM md_v4_components WHERE component_id=$1",[privateComponent]),/foreign key constraint/i);
    // A tenant-owned component must never be usable by another tenant,
    // including after a failed insert into the dependency registry.
    const foreignDependencies=await db.query(
      'SELECT COUNT(*)::integer AS n FROM md_v4_component_dependencies WHERE tenant_id=$1 AND component_id=$2',
      ['tenant_b',privateComponent]);
    assert.equal(foreignDependencies.rows[0].n,0);
    const ownDependencies=await db.query(
      'SELECT COUNT(*)::integer AS n FROM md_v4_component_dependencies WHERE tenant_id=$1 AND component_id=$2',
      ['tenant_a',privateComponent]);
    assert.equal(ownDependencies.rows[0].n,1);
    const platformDependencies=await db.query(
      'SELECT COUNT(*)::integer AS n FROM md_v4_component_dependencies WHERE tenant_id=$1 AND component_id=$2',
      ['tenant_b',platform]);
    assert.equal(platformDependencies.rows[0].n,1);
    const versions=await db.query("SELECT version,status,compiled_js FROM md_v4_component_versions WHERE component_id=$1 ORDER BY version",[privateComponent]);
    assert.deepEqual(versions.rows.map(row=>[row.version,row.status,row.compiled_js]),[[1,'PUBLISHED','compiled-v1'],[2,'DRAFT','compiled-v2']]);
    const deps=await db.query('SELECT COUNT(*)::integer AS n FROM md_v4_component_dependencies WHERE component_id=$1',[privateComponent]);
    assert.equal(deps.rows[0].n,1);
  } finally {
    await db.query('RESET search_path').catch(()=>{});
    await db.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE').catch(()=>{});
    await db.end();
  }
});
