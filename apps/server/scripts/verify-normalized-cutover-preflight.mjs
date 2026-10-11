// READ ONLY: verifies existing JSONB state versus the complete relational staging projection.
// This is a safety gate, NOT a cutover or JSONB-to-SQL migration executor.
import pg from 'pg';
import {readRelationalRows} from '../src/relational-tables.mjs';
import {assessCutoverCompatibility} from '../src/normalized-cutover-gate.mjs';

if (process.argv.length !== 2) throw Error('This tool has no write/apply option');
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL is required');
const u = new URL(process.env.DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(u.protocol)) throw Error('Expected PostgreSQL DATABASE_URL');
for (const name of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) u.searchParams.delete(name);
const pool = new pg.Pool({
  connectionString: u.toString(), max: 1,
  ssl: process.env.PGSSLMODE === 'disable' ? false : {
    rejectUnauthorized: process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT !== 'true',
    ...(process.env.METADRIVE_DB_CA_CERT ? {ca: process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g, '\n')} : {})
  },
  connectionTimeoutMillis: 15000
});
const client = await pool.connect();
let started = false;
try {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  started = true;
  await client.query("SET LOCAL statement_timeout='25000'");
  const source = await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
  if (source.rowCount !== 1) throw Error('Expected one live platform state');
  const marker = await client.query('SELECT revision,source_sha256 FROM metadrive_rel_migrations WHERE revision=1');
  const runtime = await client.query('SELECT version,state_sha256 FROM metadrive_rel_runtime WHERE id=1');
  if (marker.rowCount !== 1 || runtime.rowCount !== 1)
    throw Error('Relational staging markers are missing; cutover prohibited');
  const staged = await readRelationalRows(client);
  const report = assessCutoverCompatibility(source.rows[0].payload, staged, marker.rows[0], runtime.rows[0]);
  console.log(JSON.stringify({action:'read-only-preflight',...report},null,2));
  await client.query('ROLLBACK');
  started = false;
  if (!report.ready) process.exitCode = 2;
} catch (error) {
  if (started) await client.query('ROLLBACK');
  // Fail closed without logging database values, credentials, or customer content.
  console.error('Cutover prohibited: compatibility preflight could not be verified', error instanceof Error ? error.name : 'UnknownError');
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
