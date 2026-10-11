// Opt-in, one-time relational metadata repair. Dry-run by default.
// Execute only after passing build/test and confirming a verified database backup.
import pg from 'pg';
import { readRelationalState, writeRelationalState } from '../src/relational-runtime.mjs';
import { repairWhatsappRouterMetadata, publishRepairedWhatsappVersion } from '../src/whatsapp-flow-metadata.mjs';

const apply = process.argv.includes('--apply');
const tenantId = process.env.METADRIVE_WHATSAPP_REPAIR_TENANT_ID;
if (process.env.METADRIVE_PERSISTENCE_MODE !== 'relational') throw Error('Relational mode is required');
if (!tenantId) throw Error('METADRIVE_WHATSAPP_REPAIR_TENANT_ID must select an exact tenant');
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL is required');
const url = new URL(process.env.DATABASE_URL);
for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
const pool = new pg.Pool({
  connectionString: url.toString(),
  ssl: process.env.PGSSLMODE === 'disable' ? false : {
    rejectUnauthorized: process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT !== 'true',
    ...(process.env.METADRIVE_DB_CA_CERT
      ? { ca: process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g, '\n') } : {})
  }
});
try {
  const before = await readRelationalState(pool);
  const state = structuredClone(before.state);
  const tenant = state.tenants[tenantId];
  if (!tenant || !Array.isArray(tenant.flows)) throw Error('Tenant flow metadata missing');
  const index = tenant.flows.findIndex((flow) => flow.apiName === 'WA_ROUTER');
  if (index < 0) throw Error('WA_ROUTER metadata missing');
  const source = tenant.flows[index];
  const repair = repairWhatsappRouterMetadata(source);
  if (!repair.changes.length) {
    process.stdout.write('WhatsApp starter metadata already repaired; no changes.\n');
  } else {
    if (source.status !== 'Active' || source.activeVersion !== source.versionNumber) {
      throw Error('Published version and editable version differ; repair requires review in Flow Builder');
    }
    const object = tenant.objects.find((item) => item.apiName === 'Communication_Records__c');
    const allowed = object?.fields.find((field) => field.apiName === 'Status__c')?.picklistValues ?? [];
    for (const status of ['Completed', 'Failed']) {
      if (!allowed.includes(status)) throw Error('Target status ' + status + ' is not enabled in Communication Records');
    }
    const updated = publishRepairedWhatsappVersion(source, repair.flow, new Date().toISOString());
    tenant.flows[index] = updated;
    process.stdout.write('WhatsApp flow revision ' + source.versionNumber + ' -> ' + updated.versionNumber + '\n');
    for (const change of repair.changes) process.stdout.write('- ' + change + '\n');
    if (apply) {
      await writeRelationalState(pool, state, before); // Optimistic revision check and atomic checksum.
      process.stdout.write('Metadata repair committed through verified relational-state writer.\n');
    } else {
      process.stdout.write('DRY RUN: no database changes; pass --apply after verifying backup and test results.\n');
    }
  }
} finally {
  await pool.end();
}
