// MD-03 production release gate: checks cannot be satisfied by a web request,
// environment boolean, an administrator claim or an editable tenant setting.
// Every enabled recovery API must use a separate least-privilege Aiven role
// and an append-only PostgreSQL audit trigger.
const REQUIRED_TABLES = [
  'tenant_recovery_cases', 'tenant_recovery_approvals',
  'tenant_recovery_invitations', 'tenant_recovery_events',
  'tenant_recovery_contacts', 'tenant_recovery_contact_proofs',
  'tenant_recovery_repair_grants', 'tenant_recovery_mfa_steps'
];
export const RECOVERY_DATABASE_READINESS_SQL = `
SELECT
  current_database() AS database_name,
  current_user AS role_name,
  (SELECT COALESCE(rolsuper OR rolcreatedb OR rolcreaterole, true)
     FROM pg_catalog.pg_roles WHERE rolname = current_user) AS elevated_role,
  (SELECT count(*)::integer FROM pg_catalog.pg_tables
     WHERE schemaname = 'public'
       AND tablename = ANY($1::text[])) AS recovery_tables,
  (SELECT count(*)::integer FROM pg_catalog.pg_tables
     WHERE schemaname = 'public' AND tableowner = current_user
       AND tablename = ANY($1::text[])) AS owned_tables,
  (SELECT count(*)::integer FROM pg_catalog.pg_trigger trig
    JOIN pg_catalog.pg_class tab ON tab.oid = trig.tgrelid
    JOIN pg_catalog.pg_namespace ns ON ns.oid = tab.relnamespace
    WHERE ns.nspname = 'public' AND tab.relname = 'tenant_recovery_events'
      AND trig.tgname = 'tenant_recovery_no_mutations'
      AND trig.tgenabled IN ('O','A') AND NOT trig.tgisinternal
      AND (trig.tgtype & 1) = 1
      AND (trig.tgtype & 2) = 2
      AND (trig.tgtype & 8) = 8
      AND (trig.tgtype & 16) = 16) AS immutable_audit_triggers,
  pg_catalog.has_table_privilege(current_user,
    'public.tenant_recovery_events','UPDATE,DELETE') AS can_mutate_audit,
  pg_catalog.has_schema_privilege(current_user,'public','CREATE') AS can_create_schema_objects,
  pg_catalog.has_database_privilege(current_user,current_database(),'CREATE') AS can_create_database_objects
`;
export async function assertRecoveryControlReadiness(pool, { expectedDatabase = 'metadrive_recovery_control' } = {}) {
  if (!pool || typeof pool.query !== 'function') throw Error('Recovery control pool is required');
  const result = await pool.query(RECOVERY_DATABASE_READINESS_SQL, [REQUIRED_TABLES]);
  const row = result?.rows?.[0];
  if (!row ||
      row.database_name !== expectedDatabase ||
      !row.role_name || row.role_name === 'avnadmin' || row.role_name === 'postgres' ||
      row.elevated_role !== false ||
      Number(row.recovery_tables) !== REQUIRED_TABLES.length ||
      Number(row.owned_tables) !== 0 ||
      Number(row.immutable_audit_triggers) !== 1 ||
      row.can_mutate_audit !== false ||
      row.can_create_schema_objects !== false ||
      row.can_create_database_objects !== false) {
    throw Error('Recovery control database has not passed independent security readiness checks');
  }
  return true;
}
