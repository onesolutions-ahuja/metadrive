// Phase 2: restore only verifiable canonical Object/Component metadata.
// Usage: node apps/server/scripts/recover-phase2-metadata.mjs --source /secure/canonical-state.json
// Dry-run by default. Requires --apply AND METADRIVE_PHASE2_RECOVERY_APPROVED=true for writes.
// Never infer component definitions from numeric positions or replace non-null payloads.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import process from 'node:process';

export function constructRecoveryPlan(state, liveObjects, liveComponents) {
  if (!state || typeof state !== 'object' || !state.tenants || !Array.isArray(state.libraryComponents)) {
    throw Error('Canonical source must be a complete platform-state snapshot including libraryComponents');
  }
  const objects = [];
  for (const [tenantId, tenant] of Object.entries(state.tenants)) {
    if (!Array.isArray(tenant?.objects)) throw Error('Invalid objects array: ' + tenantId);
    for (const value of tenant.objects) {
      if (!value || typeof value.apiName !== 'string' || !Array.isArray(value.fields)) {
        throw Error('Incomplete canonical object metadata in ' + tenantId);
      }
      objects.push({ tenantId, apiName: value.apiName, payload: value });
    }
  }
  const objectMap = new Map(objects.map(o => [JSON.stringify([o.tenantId, o.apiName]), o]));
  if (objectMap.size !== objects.length) throw Error('Duplicate canonical Object identifiers');
  const componentMap = new Map(state.libraryComponents.map((item, position) => {
    if (!item || typeof item.apiName !== 'string' || !item.apiName.trim()) {
      throw Error('Missing component apiName at position ' + position);
    }
    return [position, item];
  }));
  const missing = [];
  const objectUpdates = [];
  const componentUpdates = [];
  for (const row of liveObjects) {
    const key = JSON.stringify([row.tenant_id, row.object_api_name]);
    const item = objectMap.get(key);
    if (!item) missing.push('object ' + row.tenant_id + '/' + row.object_api_name);
    else if (row.payload == null) objectUpdates.push({ ...row, payload: item.payload });
    else if (JSON.stringify(row.payload) !== JSON.stringify(item.payload)) {
      missing.push('existing object payload differs: ' + key);
    }
  }
  for (const row of liveComponents) {
    const item = componentMap.get(row.position);
    if (!item) missing.push('component position ' + row.position);
    else if (row.payload == null) componentUpdates.push({ ...row, payload: item });
    else if (JSON.stringify(row.payload) !== JSON.stringify(item)) {
      missing.push('existing component payload differs: ' + row.position);
    }
  }
  return { objectUpdates, componentUpdates, missing };
}

async function main() {
  const args = process.argv.slice(2);
  const sourceIndex = args.indexOf('--source');
  if (sourceIndex < 0 || !args[sourceIndex + 1]) throw Error('Pass --source /path/to/verified/canonical-state.json');
  const source = readFileSync(args[sourceIndex + 1]);
  const hash = createHash('sha256').update(source).digest('hex');
  const state = JSON.parse(source.toString('utf8'));
  const { default: pg } = await import('pg');
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL is required');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let inTransaction = false;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    inTransaction = true;
    const cols = await client.query(`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN ('metadrive_rel_objects','metadrive_rel_library_components')`);
    const existing = new Set(cols.rows.map(r => r.table_name + '.' + r.column_name));
    const tables = ['metadrive_rel_objects', 'metadrive_rel_library_components'];
    for (const table of tables) {
      if (!existing.has(table + '.' + (table === 'metadrive_rel_objects' ? 'object_api_name' : 'position'))) {
        throw Error('Unexpected relational registry schema: ' + table);
      }
      await client.query('LOCK TABLE ' + table + ' IN SHARE ROW EXCLUSIVE MODE');
    }
    // Nullable columns are additive; constraint is applied only after complete recovery.
    // In dry run, do not change DDL even temporarily.
    const objHasPayload = existing.has('metadrive_rel_objects.payload');
    const compHasPayload = existing.has('metadrive_rel_library_components.payload');
    const obj = await client.query('SELECT tenant_id, object_api_name, position' + (objHasPayload ? ', payload' : '') + ' FROM metadrive_rel_objects ORDER BY tenant_id, position');
    const comp = await client.query('SELECT position' + (compHasPayload ? ', payload' : '') + ' FROM metadrive_rel_library_components ORDER BY position');
    const plan = constructRecoveryPlan(state, obj.rows, comp.rows);
    const report = { sourceSha256: hash, liveObjects: obj.rowCount, liveComponents: comp.rowCount,
      objectUpdates: plan.objectUpdates.length, componentUpdates: plan.componentUpdates.length,
      unresolved: plan.missing };
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (plan.missing.length) throw Error('Refusing partial restore: canonical definitions missing or changed');
    const apply = args.includes('--apply');
    if (!apply) { await client.query('ROLLBACK'); inTransaction = false; return; }
    if (process.env.METADRIVE_PHASE2_RECOVERY_APPROVED !== 'true') throw Error('Explicit recovery approval required');
    if (!objHasPayload) await client.query('ALTER TABLE metadrive_rel_objects ADD COLUMN payload jsonb');
    if (!compHasPayload) await client.query('ALTER TABLE metadrive_rel_library_components ADD COLUMN payload jsonb');
    for (const row of plan.objectUpdates) {
      const r = await client.query('UPDATE metadrive_rel_objects SET payload=$1::jsonb WHERE tenant_id=$2 AND object_api_name=$3 AND payload IS NULL',
        [JSON.stringify(row.payload), row.tenant_id, row.object_api_name]);
      if (r.rowCount !== 1) throw Error('Object write collision, rolling back');
    }
    for (const row of plan.componentUpdates) {
      const r = await client.query('UPDATE metadrive_rel_library_components SET payload=$1::jsonb WHERE position=$2 AND payload IS NULL',
        [JSON.stringify(row.payload), row.position]);
      if (r.rowCount !== 1) throw Error('Component write collision, rolling back');
    }
    for (const table of tables) {
      const r = await client.query('SELECT count(*)::int AS missing FROM ' + table + ' WHERE payload IS NULL');
      if (r.rows[0].missing) throw Error('Unpopulated rows remain in ' + table);
      await client.query('ALTER TABLE ' + table + ' ALTER COLUMN payload SET NOT NULL');
    }
    await client.query('COMMIT');
    inTransaction = false;
    process.stdout.write('Verified atomic metadata recovery committed.\n');
  } finally {
    if (inTransaction) await client.query('ROLLBACK');
    await client.end();
  }
}
if (process.argv[1]?.endsWith('recover-phase2-metadata.mjs')) {
  main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
