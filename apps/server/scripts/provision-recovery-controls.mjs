// Execute manually with separate migration credentials after independent
// approval. This file never runs at server startup or in automatic deployment.
// It does not create a service, touch tenant databases or configure SMTP.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { assertRecoveryControlReadiness } from '../src/tenant-recovery-readiness.mjs';

const DATABASE = 'metadrive_recovery_control';
const ROLE = 'metadrive_recovery_runtime';
const MIGRATION_URL = process.env.METADRIVE_RECOVERY_MIGRATION_DATABASE_URL;
const PASSWORD = process.env.METADRIVE_RECOVERY_ROLE_PASSWORD;

async function main() {
  if (process.argv.includes('--help')) {
    console.info('Run with --apply and private METADRIVE_RECOVERY_MIGRATION_DATABASE_URL plus METADRIVE_RECOVERY_ROLE_PASSWORD (32+ chars).');
    return;
  }
  if (!process.argv.includes('--apply')) {
    console.info('No changes made. Run --help for privileged, opt-in recovery database setup.');
    return;
  }
  if (!MIGRATION_URL || !PASSWORD || PASSWORD.length < 32 || PASSWORD.length > 1024)
    throw Error('Independent migration connection and a unique 32+ character runtime password are required');
  const url = new URL(MIGRATION_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/' + DATABASE)
    throw Error('Migration URL must point to the dedicated recovery control database');
  // Node PostgreSQL driver requires an explicit trusted TLS chain in production.
  // Local CI/integration testing uses the separate fixture and not this script.
  if (!url.hostname || ['localhost', '127.0.0.1', '::1'].includes(url.hostname))
    throw Error('Recovery control provisioning must use the configured Aiven host');
  const admin = new pg.Client({ connectionString: MIGRATION_URL, connectionTimeoutMillis: 10000 });
  await admin.connect();
  try {
    const identity = await admin.query('SELECT current_database() AS db, current_user AS actor');
    if (identity.rows[0]?.db !== DATABASE || identity.rows[0]?.actor === ROLE)
      throw Error('A separate privileged migration principal is required');
    const role = await admin.query('SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname=$1', [ROLE]);
    if (role.rowCount && Object.values(role.rows[0]).some(Boolean))
      throw Error('Refusing to reuse a previously elevated recovery role');
    const sql = readFileSync(fileURLToPath(new URL('../sql/tenant-recovery-control.sql', import.meta.url)), 'utf8');
    await admin.query('BEGIN');
    try {
      // Transactional: no time window with only half the schema or permissions.
      await admin.query(sql);
      if (!role.rowCount) await admin.query('CREATE ROLE ' + ROLE + ' NOLOGIN NOINHERIT');
      // Only the user-run migration knows the secret; never commit/log it.
      await admin.query('ALTER ROLE ' + ROLE + ' LOGIN NOINHERIT PASSWORD ' + pg.escapeLiteral(PASSWORD));
      await admin.query('REVOKE ALL ON DATABASE ' + DATABASE + ' FROM PUBLIC');
      await admin.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
      await admin.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC');
      await admin.query('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC');
      await admin.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ' + ROLE);
      await admin.query('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ' + ROLE);
      await admin.query('GRANT CONNECT ON DATABASE ' + DATABASE + ' TO ' + ROLE);
      await admin.query('GRANT USAGE ON SCHEMA public TO ' + ROLE);
      const writable = [
        'tenant_recovery_cases', 'tenant_recovery_invitations',
        'tenant_recovery_contacts', 'tenant_recovery_contact_proofs',
        'tenant_recovery_repair_grants'
      ];
      for (const table of writable) {
        await admin.query('GRANT SELECT,INSERT,UPDATE ON public.' + table + ' TO ' + ROLE);
      }
      for (const table of ['tenant_recovery_approvals','tenant_recovery_events','tenant_recovery_mfa_steps']) {
        await admin.query('GRANT SELECT,INSERT ON public.' + table + ' TO ' + ROLE);
      }
      await admin.query('GRANT USAGE ON SEQUENCE public.tenant_recovery_events_id_seq TO ' + ROLE);
      await admin.query('COMMIT');
    } catch (error) {
      await admin.query('ROLLBACK');
      throw error;
    }
    // Verify using THE EXACT ROLE the API will use. A successful migration
    // under avnadmin is insufficient and must never enable the recovery API.
    const runtime = new URL(MIGRATION_URL);
    runtime.username = ROLE;
    runtime.password = PASSWORD;
    const guest = new pg.Client({connectionString: runtime.toString(), connectionTimeoutMillis: 10000});
    await guest.connect();
    try {
      await assertRecoveryControlReadiness(guest);
      await guest.query('SELECT count(*)::integer FROM public.tenant_recovery_cases');
      console.info('Verified dedicated recovery DB, least-privilege runtime role, and immutable audit trigger.');
    } finally { await guest.end(); }
  } finally { await admin.end(); }
}
main().catch(error => {
  console.error('Recovery control provisioning or readiness failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
