import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRecoveryControlReadiness, RECOVERY_DATABASE_READINESS_SQL } from '../src/tenant-recovery-readiness.mjs';

const valid = () => ({
  database_name: 'metadrive_recovery_control', role_name: 'metadrive_recovery_runtime',
  elevated_role: false, recovery_tables: 8, owned_tables: 0,
  immutable_audit_triggers: 1, can_mutate_audit: false,
  can_create_schema_objects: false, can_create_database_objects: false
});
const pool = row => ({ query: async (sql, params) => {
  assert.ok(sql.includes('pg_catalog.pg_trigger'));
  assert.ok(sql.includes('pg_catalog.pg_roles'));
  assert.ok(sql.includes('pg_catalog.pg_tables'));
  assert.equal(params[0].length, 8);
  return { rows: [row] };
} });
test('MD-03 production: fail closed unless separate database and least-privilege role are proven', async () => {
  assert.equal(await assertRecoveryControlReadiness(pool(valid())), true);
  for (const [key, value] of [
    ['database_name', 'defaultdb'], ['role_name', 'avnadmin'],
    ['role_name', 'postgres'], ['elevated_role', true], ['recovery_tables', 7],
    ['owned_tables', 1], ['immutable_audit_triggers', 0],
    ['can_mutate_audit', true], ['can_create_schema_objects', true],
    ['can_create_database_objects', true]
  ]) await assert.rejects(assertRecoveryControlReadiness(pool({ ...valid(), [key]: value })));
  await assert.rejects(assertRecoveryControlReadiness(pool(null)));
  await assert.rejects(assertRecoveryControlReadiness(pool({ ...valid(), immutable_audit_triggers: 2 })));
  await assert.rejects(assertRecoveryControlReadiness(null));
});
test('MD-03 production: failed database query never allows recovery', async () => {
  await assert.rejects(assertRecoveryControlReadiness({query: async () => {throw Error('database unavailable')}}));
});
test('MD-03 production: readiness query checks row-level UPDATE and DELETE trigger', () => {
  assert.match(RECOVERY_DATABASE_READINESS_SQL, /tgtype & 8/);
  assert.match(RECOVERY_DATABASE_READINESS_SQL, /tgtype & 16/);
  assert.match(RECOVERY_DATABASE_READINESS_SQL, /UPDATE,DELETE/);
});
