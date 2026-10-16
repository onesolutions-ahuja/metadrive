// Opt-in, one-time relational metadata repair. Dry-run by default.
// Execute only after passing build/test and confirming a verified database backup.
import pg from 'pg';
import { readNormalizedState, writeNormalizedState } from '../src/normalized-state-runtime.mjs';
import { repairWhatsappRouterMetadata, publishRepairedWhatsappVersion } from '../src/whatsapp-flow-metadata.mjs';

const apply = process.argv.includes('--apply');
const tenantId = process.env.METADRIVE_WHATSAPP_REPAIR_TENANT_ID;
if (process.env.METADRIVE_PERSISTENCE_MODE !== 'normalized') throw Error('SQL-only normalized mode is required; legacy persistence is not an allowed repair target');
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
  const before = await readNormalizedState(pool);
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
      const required = ['METADRIVE_CONFIRMED_OFFLINE', 'METADRIVE_BACKUP_VERIFIED_RESTORE'];
      for (const name of required) if (process.env[name] !== 'true') throw Error(name + ' must be explicitly verified');
      const barrier = process.env.METADRIVE_MAINTENANCE_BARRIER_URL;
      if (!barrier || !barrier.startsWith('https://')) throw Error('An HTTPS maintenance barrier is required');
      const response = await fetch(barrier, { signal: AbortSignal.timeout(15000) });
      if (response.status !== 503 || (await response.json()).error !== 'MetaDrive database maintenance in progress')
        throw Error('Public maintenance barrier is not active; refusing mutation');
      const { createHash } = await import('node:crypto');
      const { createReadStream, statSync } = await import('node:fs');
      const file = process.env.METADRIVE_VERIFIED_BACKUP_FILE;
      const hash = process.env.METADRIVE_VERIFIED_BACKUP_SHA256;
      if (!file || !hash || !/^[a-f\d]{64}$/i.test(hash) || statSync(file).size < 20)
        throw Error('A fresh independently restorable full-database backup is required');
      const digest = createHash('sha256');
      for await (const chunk of createReadStream(file)) digest.update(chunk);
      if (digest.digest('hex') !== hash.toLowerCase()) throw Error('Verified backup checksum mismatch');
      await writeNormalizedState(pool, state, before);
      process.stdout.write('WhatsApp metadata repair committed to SQL-only normalized state.\n');
    } else {
      process.stdout.write('DRY RUN: no database changes; SQL-only mode and verified offline backup are required for --apply.\n');
    }
  }
} finally {
  await pool.end();
}
