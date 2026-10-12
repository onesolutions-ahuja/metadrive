// Read-only verification of both legacy JSONB and current SQL-only Aiven state.
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { projectState, verifyProjection } from '../src/relational-projection.mjs';
import { readNormalizedState } from '../src/normalized-state-runtime.mjs';
import { verifyTypedRecords } from '../src/normalized-typed-records.mjs';
if (!process.env.DATABASE_URL) throw Error('Database connection secret unavailable');
const u = new URL(process.env.DATABASE_URL);
const localHost = ['localhost','127.0.0.1','::1'].includes(u.hostname);
const aivenRequire = u.hostname.toLowerCase().endsWith('.aivencloud.com') &&
  u.searchParams.get('sslmode') === 'require';
if (process.env.PGSSLMODE === 'disable' && !localHost)
  throw Error('Unencrypted remote PostgreSQL access is not allowed');
for (const k of ['sslmode','sslcert','sslkey','sslrootcert']) u.searchParams.delete(k);
const pool = new pg.Pool({
  connectionString: u.toString(),
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: !aivenRequire },
  max: 2, connectionTimeoutMillis: 15000
});
try {
  const client = await pool.connect();
  let legacy = false;
  let hasTyped = false;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const ssl = await client.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()");
    if (!localHost && ssl.rows[0]?.ssl !== true)
      throw Error('Remote PostgreSQL connection is not TLS');
    const columns = await client.query(`SELECT
      EXISTS(SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='metadrive_platform_state' AND column_name='payload') AS legacy,
      EXISTS(SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='md_v3_runtime') AS typed`);
    legacy = columns.rows[0].legacy;
    hasTyped = columns.rows[0].typed;
    if (!legacy && !hasTyped) throw Error('Unrecognized MetaDrive database layout');
    if (legacy) {
      const t = await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
      if (t.rowCount !== 1) throw Error('Wrong database: missing MetaDrive source state');
      const verified = verifyProjection(t.rows[0].payload, projectState(t.rows[0].payload));
      if (process.env.METADRIVE_DIGEST_FILE)
        writeFileSync(process.env.METADRIVE_DIGEST_FILE,verified.digest+'\n',{flag:'wx',mode:0o600});
      console.log(JSON.stringify({sourceVerified:true,layout:'legacy',sha256:verified.digest,counts:verified.counts}));
    }
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally { client.release(); }
  if (!legacy) {
    // SQL-only data never had a legacy payload. Verify the typed graph and
    // per-tenant physical tables using an internally consistent SQL snapshot.
    const result = await readNormalizedState(pool,verifyTypedRecords);
    const count = Object.keys(result.state.tenants ?? {}).length;
    if (count === 0) throw Error('SQL-only restore lost all tenants');
    if (process.env.METADRIVE_DIGEST_FILE)
      writeFileSync(process.env.METADRIVE_DIGEST_FILE,result.digest+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({sourceVerified:true,layout:'sql-only',sha256:result.digest,tenants:count}));
  }
} finally { await pool.end(); }
