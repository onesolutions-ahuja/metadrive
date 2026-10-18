import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { SqlPersistence } from '../system-files/sql-persistence.js';

/** Versioned snapshot of the reviewed web One- descriptor index.
 * Test coverage rejects drift between this SQL seeder and the bundled manifest. */
export const BUNDLED_COMPONENTS = [
  "OneContainer",
  "OneStack",
  "OneGrid",
  "OneSplitPane",
  "OneCard",
  "OneTabs",
  "OneAccordion",
  "OneOverlay",
  "OneText",
  "OneImage",
  "OneIcon",
  "OneAvatar",
  "OneBadge",
  "OneDivider",
  "OneAlert",
  "OneProgress",
  "OneMetric",
  "OneInput",
  "OneChoice",
  "OneToggle",
  "OneSlider",
  "OneLookup",
  "OneFileUpload",
  "OneRepeater",
  "OneButton",
  "OneSearch",
  "OneNavigation",
  "OneMenu",
  "OnePagination",
  "OneTable",
  "OneRecordForm",
  "OneChart",
  "OneCalendar",
  "OneBoard",
  "OneTimeline",
  "OneItemGrid",
  "OneTree",
  "OneDocumentViewer",
  "OneConversation",
  "OneShoppingCart",
  "OneDashboardEmbed"
] as const;
export const BUNDLED_COMPONENT_SEED_VERSION = 'core-bundled-components-v1';

export async function seedFreshBundledComponents(client: PoolClient, tenantId: string) {
  for (const apiName of BUNDLED_COMPONENTS) {
    await client.query(
      'INSERT INTO md_component_definitions(tenant_id,api_name,renderer_key,enabled) VALUES($1,$2,$3,true) ON CONFLICT(tenant_id,api_name) DO NOTHING',
      [tenantId,apiName,apiName]);
  }
}

/** Idempotent Core registry backfill; never overwrites tenant edits or components. */
export async function seedBundledComponentsForExistingTenants(db: SqlPersistence): Promise<number> {
  const checksum=createHash('sha256').update(JSON.stringify(BUNDLED_COMPONENTS)).digest('hex');
  return db.transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['metadrive:system:migrations']);
    const applied=await client.query<{checksum:string}>(
      'SELECT checksum FROM md_system_migrations WHERE version=$1',[BUNDLED_COMPONENT_SEED_VERSION]);
    if(applied.rows[0]&&applied.rows[0].checksum!==checksum)
      throw Error('Bundled Core component seed changed after installation');
    const {rows}=await client.query<{id:string}>('SELECT id FROM md_tenants ORDER BY id');
    for(const tenant of rows) await seedFreshBundledComponents(client,tenant.id);
    if(!applied.rows[0])
      await client.query('INSERT INTO md_system_migrations(version,checksum) VALUES($1,$2)',
        [BUNDLED_COMPONENT_SEED_VERSION,checksum]);
    return rows.length;
  });
}
