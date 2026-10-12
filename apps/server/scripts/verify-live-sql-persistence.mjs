// Post-cutover, read-only attestation of the live MetaDrive SQL-only Aiven target.
// Does not compare the current revision to the initial backup: valid production
// writes advance the current checksum after the verified blue/green cutover.
// Never prints tenant data, authentication material or database connection URLs.
import pg from 'pg';
import {readNormalizedState} from '../src/normalized-state-runtime.mjs';
import {verifyTypedRecords} from '../src/normalized-typed-records.mjs';

const source = process.env.DATABASE_URL;
const targetName = process.env.METADRIVE_SQL_TARGET_DB;
if (!source) throw Error('Aiven DATABASE_URL is required');
if (!/^[a-z][a-z0-9_]{2,61}$/.test(targetName ?? '')) {
  throw Error('An explicit SQL-only target database name is required');
}
const url = new URL(source);
if (!url.hostname.toLowerCase().endsWith('.aivencloud.com')
  || url.searchParams.get('sslmode') !== 'require'
  || process.env.PGSSLMODE === 'disable') {
  throw Error('Aiven TLS connection is required');
}
const sourceName = decodeURIComponent(url.pathname.slice(1));
if (!sourceName || sourceName === targetName) {
  throw Error('Target must be distinct from the configured source database');
}
url.pathname = '/' + targetName;
for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
  url.searchParams.delete(key);
}
const pool = new pg.Pool({
  connectionString: url.toString(),
  max: 1,
  connectionTimeoutMillis: 15000,
  ssl: {
    rejectUnauthorized: process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT !== 'true',
    ...(process.env.METADRIVE_DB_CA_CERT
      ? {ca: process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g, '\n')}
      : {})
  }
});
try {
  const connection = await pool.query(
    'SELECT current_database() AS db, ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()'
  );
  if (connection.rows[0]?.db !== targetName || connection.rows[0]?.ssl !== true) {
    throw Error('Wrong database or unencrypted connection');
  }
  const json = await pool.query(
    "SELECT count(*)::integer AS n FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') AND data_type IN ('json','jsonb')"
  );
  if (Number(json.rows[0]?.n) !== 0) {
    throw Error('SQL-only database contains JSON/JSONB columns');
  }
  // This verifies the state checksum and every physical SQL object/field/record
  // under the same REPEATABLE READ snapshot (including tenant isolation).
  const snapshot = await readNormalizedState(pool, verifyTypedRecords);
  if (!Number.isSafeInteger(snapshot.version) || snapshot.version < 1
      || !Object.keys(snapshot.state?.tenants ?? {}).length) {
    throw Error('Uninitialized or empty SQL-only tenant state');
  }
  const archived = await pool.query(
    'SELECT (SELECT count(*) FROM md_v4_archive_sources) AS sources, (SELECT count(*) FROM md_v4_archive_rows) AS rows'
  );
  const sources = Number(archived.rows[0]?.sources);
  const rows = Number(archived.rows[0]?.rows);
  if (!Number.isSafeInteger(sources) || sources < 1
      || !Number.isSafeInteger(rows) || rows < 1) {
    throw Error('Lossless migration archive is absent');
  }
  console.log(JSON.stringify({
    result: 'PASS',
    zeroJsonColumns: true,
    stateChecksumVerified: true,
    physicalSqlRecordsVerified: true,
    archivedRowsPresent: true,
    revision: snapshot.version,
    tenantCount: Object.keys(snapshot.state.tenants).length
  }));
} catch {
  // Keep potentially sensitive driver error details out of CI logs.
  console.error('FAIL: Aiven SQL-only persistence attestation');
  process.exitCode = 1;
} finally {
  await pool.end();
}
