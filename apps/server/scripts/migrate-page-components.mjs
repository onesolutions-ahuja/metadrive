#!/usr/bin/env node
/**
 * Tenant-scoped Page Builder component migration.
 * Changes are conditional on an approved, explicit parity mapping and are
 * backed up in SQL in the SAME transaction. Never migrates dashboard/flow
 * references or rewrites component IDs, layout, properties or events.
 *
 * Usage: node apps/server/scripts/migrate-page-components.mjs --tenant TENANT --mapping FILE --dry-run
 *        node apps/server/scripts/migrate-page-components.mjs --tenant TENANT --mapping FILE --apply
 *        node apps/server/scripts/migrate-page-components.mjs --tenant TENANT --rollback RUN_ID
 */
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const safeName = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(value);
const parse = payload => typeof payload === 'string' ? JSON.parse(payload) : payload;
const copy = value => structuredClone(value);

export function planPageReplacement(page, mapping, registered) {
  const result = copy(page);
  const changes = [];
  if (!Array.isArray(result.components)) return {page:result,changes};
  for (const instance of result.components) {
    if (typeof instance?.type !== 'string' || !instance.type.startsWith('Custom:')) continue;
    const from = instance.type.slice(7);
    const rule = mapping.find(rule => rule.from === from);
    if (!rule) continue;
    const target = registered.find(def => def.apiName === rule.to && def.status !== 'Draft' && def.surfaces?.includes('page'));
    if (!target) throw new Error('Missing published page component: ' + rule.to);
    if (![rule.from,rule.to].every(safeName) || !rule.to.startsWith('One')) throw new Error('Invalid component mapping');
    if (rule.parityVerified !== true || rule.tenantApproved !== true ||
        rule.metadataSnapshotVerified !== true || rule.draftPublishRollbackVerified !== true) {
      throw new Error('Unapproved migration mapping: ' + from);
    }
    const allowed = new Set((target.propertyDefinitions ?? []).map(p => p.propertyKey));
    const savedKeys = Object.keys(instance.properties ?? {});
    if (savedKeys.some(key => !allowed.has(key))) {
      throw new Error('Property parity mismatch for ' + from + ': ' + savedKeys.filter(key => !allowed.has(key)).join(','));
    }
    // Only reference changes. All instance IDs and configuration stay unchanged.
    instance.type = 'Custom:' + rule.to;
    changes.push({from,to:rule.to,id:instance.id ?? null});
  }
  return {page:result,changes};
}

export function validateMapping(document, tenantId) {
  if (!document || document.tenantId !== tenantId || !Array.isArray(document.mappings)) throw new Error('Tenant mapping mismatch');
  const seen = new Set();
  for (const rule of document.mappings) {
    if (!safeName(rule.from) || !safeName(rule.to) || !rule.to.startsWith('One') || seen.has(rule.from)) throw new Error('Duplicate or invalid mapping');
    if (rule.from === rule.to) throw new Error('Identity mapping is not a migration');
    seen.add(rule.from);
  }
  return document.mappings;
}

export async function executePageMigration(client,{tenantId,document,apply=false,rollback=null}) {
  if (!tenantId) throw new Error('Tenant required');
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['page-component-migration:' + tenantId]);
    await client.query(`CREATE TABLE IF NOT EXISTS metadrive_page_component_migration_backup (
      run_id UUID NOT NULL, tenant_id TEXT NOT NULL, position INTEGER NOT NULL,
      previous_payload JSONB NOT NULL, migrated_payload JSONB NOT NULL,
      restored_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(run_id,tenant_id,position)
    )`);
    if (rollback) {
      const saved = await client.query('SELECT position,previous_payload,migrated_payload,restored_at FROM metadrive_page_component_migration_backup WHERE tenant_id=$1 AND run_id=$2::uuid FOR UPDATE',[tenantId,rollback]);
      if (!saved.rows.length) throw new Error('No backup for tenant/run');
      for (const row of saved.rows) {
        if (row.restored_at) throw new Error('Already restored');
        const update = await client.query(`UPDATE metadrive_rel_tenant_collection_items SET payload=$1::jsonb
          WHERE tenant_id=$2 AND collection_name='pages' AND position=$3 AND payload=$4::jsonb`,
          [JSON.stringify(row.previous_payload),tenantId,row.position,JSON.stringify(row.migrated_payload)]);
        if (update.rowCount !== 1) throw new Error('Rollback conflict: page changed after migration');
      }
      await client.query('UPDATE metadrive_page_component_migration_backup SET restored_at=now() WHERE tenant_id=$1 AND run_id=$2::uuid',[tenantId,rollback]);
      await client.query('COMMIT');
      return {tenantId,rollback,restored:saved.rows.length};
    }
    const mapping = validateMapping(document,tenantId);
    const catalog = await client.query('SELECT payload FROM metadrive_rel_library_components');
    const registered = catalog.rows.map(r=>parse(r.payload));
    const pages = await client.query(`SELECT position,payload FROM metadrive_rel_tenant_collection_items
       WHERE tenant_id=$1 AND collection_name='pages' ORDER BY position FOR UPDATE`,[tenantId]);
    const planned = pages.rows.map(row=>({...row,...planPageReplacement(parse(row.payload),mapping,registered)})).filter(row=>row.changes.length);
    const counts = planned.flatMap(row=>row.changes).reduce((acc,c)=>(acc[c.from]=(acc[c.from]??0)+1,acc),{});
    if (!apply) {await client.query('ROLLBACK'); return {mode:'dry-run',tenantId,pages:planned.length,references:counts};}
    if (!planned.length) {await client.query('COMMIT');return {mode:'applied',tenantId,pages:0,references:{}};}
    const runId=randomUUID();
    for (const row of planned) {
      await client.query(`INSERT INTO metadrive_page_component_migration_backup
         (run_id,tenant_id,position,previous_payload,migrated_payload)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)`,[runId,tenantId,row.position,JSON.stringify(parse(row.payload)),JSON.stringify(row.page)]);
      const result=await client.query(`UPDATE metadrive_rel_tenant_collection_items SET payload=$1::jsonb
        WHERE tenant_id=$2 AND collection_name='pages' AND position=$3 AND payload=$4::jsonb`,
        [JSON.stringify(row.page),tenantId,row.position,JSON.stringify(parse(row.payload))]);
      if(result.rowCount!==1) throw new Error('Concurrent update conflict');
    }
    await client.query('COMMIT');
    return {mode:'applied',runId,tenantId,pages:planned.length,references:counts};
  } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
}

async function main(){
  const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
  const tenantId=arg('--tenant');
  const rollback=arg('--rollback');
  const apply=process.argv.includes('--apply');
  if (!tenantId || (!rollback && !arg('--mapping')) || (rollback && (apply || arg('--mapping')))) throw new Error('Supply --tenant plus --mapping [--apply] OR --rollback RUN_ID');
  const document=rollback?null:JSON.parse(readFileSync(arg('--mapping'),'utf8'));
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const {default:pg}=await import('pg');
  const client=new pg.Client({connectionString:process.env.DATABASE_URL});
  try{await client.connect();const result=await executePageMigration(client,{tenantId,document,apply,rollback});process.stdout.write(JSON.stringify(result,null,2)+'\n');}
  finally{await client.end().catch(()=>{});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(e=>{console.error(e.message);process.exitCode=1;});
