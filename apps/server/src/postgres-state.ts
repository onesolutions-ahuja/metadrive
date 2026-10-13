import pg from 'pg';
import { readRelationalState, writeRelationalState, type RelationalSnapshot } from './relational-runtime.mjs';
import { readNormalizedState, writeNormalizedState, type NormalizedSnapshot } from './normalized-state-runtime.mjs';
import {synchronizeTypedRecords,verifyTypedRecords} from './normalized-typed-records.mjs';

const { Pool } = pg;
// Explicit typed mode: SQL-only canonical metadata + transactional typed physical records.
// Current production remains unchanged until verified offline cutover.
export const persistenceMode = process.env.METADRIVE_PERSISTENCE_MODE ?? 'jsonb';
if (!['jsonb', 'relational', 'normalized', 'typed'].includes(persistenceMode)) throw new Error('Invalid METADRIVE_PERSISTENCE_MODE');
const strictSqlOnly = process.env.METADRIVE_ZERO_JSONB_REQUIRED === 'true';
if (strictSqlOnly && persistenceMode !== 'typed') throw new Error('Zero-JSONB requires typed SQL mode');
let relationalSnapshot: RelationalSnapshot | null = null;
let normalizedSnapshot: NormalizedSnapshot | null = null;
// Explicit opt-in is required even after creating verified normalized SQL tables.
if (['normalized','typed'].includes(persistenceMode) && process.env.METADRIVE_NORMALIZED_ALLOW_RUNTIME !== 'true')
  throw new Error('Normalized SQL runtime is not approved for production cutover');
const connectionString = process.env.DATABASE_URL;
// Preserve the explicit no-DB test harness from the latest main branch.
const testOnlyLocalState = process.env.NODE_ENV === 'test' && process.env.METADRIVE_TEST_MODE === 'true';
if (!connectionString && !testOnlyLocalState) throw new Error('DATABASE_URL is required for persistent UNEEngine state');
if (['relational','normalized','typed'].includes(persistenceMode) && !connectionString) throw new Error('SQL persistence requires DATABASE_URL');

// Keep SSL configuration in one place: pg URL sslmode options otherwise override the trusted CA.
const databaseUrl = connectionString ? new URL(connectionString) : null;
// A blue/green database cutover changes only the database name, not the host,
// TLS policy, username or password. Never include this value in diagnostic logs.
const databaseOverride = process.env.METADRIVE_DB_NAME_OVERRIDE;
if (databaseOverride) {
  if (persistenceMode !== 'typed') throw new Error('Database override requires typed SQL persistence');
  if (!/^[a-z][a-z0-9_]{2,61}$/.test(databaseOverride))
    throw new Error('Invalid SQL-only cutover database identifier');
  if (!databaseUrl) throw new Error('SQL-only cutover requires a configured connection');
  databaseUrl.pathname = '/' + databaseOverride;
}
if (databaseUrl) for (const key of ['sslmode','sslcert','sslkey','sslrootcert']) databaseUrl.searchParams.delete(key);

const pool = databaseUrl ? new Pool({
  connectionString: databaseUrl.toString(),
  ssl: process.env.PGSSLMODE === 'disable' ? false : {
    rejectUnauthorized: process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT !== 'true',
    ...(process.env.METADRIVE_DB_CA_CERT ? { ca: process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g, '\n') } : {})
  },
  max: 3,
  connectionTimeoutMillis: 15000
}) : null;

/**
 * Only one SQL-backed scheduler may dispatch across API replicas.
 * A session-level advisory lock on a dedicated connection is released in
 * finally; PostgreSQL also releases it if the process/connection dies.
 * Contention skips this poll; the next interval retries outstanding work.
 */
export async function withSchedulerLease(run: () => Promise<void>): Promise<boolean> {
  if (!pool) {
    if (testOnlyLocalState) { await run(); return true; }
    throw new Error('Native scheduler requires PostgreSQL persistence');
  }
  const client = await (pool as unknown as { connect(): Promise<{ query(sql: string, params?: unknown[]): Promise<{ rows: Array<{ acquired?: boolean; released?: boolean }> }>; release(destroy?: boolean): void }> }).connect();
  let acquired = false;
  try {
    const result = await client.query('SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired', [1330463812, 1]);
    acquired = result.rows[0]?.acquired === true;
    if (!acquired) return false;
    await run();
    return true;
  } finally {
    if (acquired) {
      try {
        const unlocked = await client.query('SELECT pg_advisory_unlock($1::integer, $2::integer) AS released', [1330463812, 1]);
        if (unlocked.rows[0]?.released !== true) throw new Error('Scheduler advisory lease release was not confirmed');
      } catch (error) {
        // A failed unlock must never return a possibly locked session to the pool.
        client.release(true);
        throw error;
      }
      client.release();
    } else client.release();
  }
}

export async function checkDatabaseConnection(): Promise<'healthy' | 'unavailable' | 'not_configured'> {
  if (!pool) return 'not_configured';
  try {
    await pool.query('SELECT 1');
    return 'healthy';
  } catch {
    return 'unavailable';
  }
}

export async function readPersistedState(): Promise<unknown | null> {
  if (!pool) return null;
  if (strictSqlOnly) {
    const remaining = await pool.query(`SELECT COUNT(*)::integer AS n FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog','information_schema') AND data_type IN ('json','jsonb')`);
    if (Number((remaining.rows[0] as {n?: unknown} | undefined)?.n) !== 0) throw new Error('Zero-JSONB database gate failed');
  }
  if (persistenceMode === 'normalized' || persistenceMode === 'typed') {
    // SQL-only read. Typed mode verifies physical records under the SAME SQL snapshot.
    // No fallback to legacy JSONB, even on first start or lost connections.
    const previousSnapshot = normalizedSnapshot;
    const refreshed = await readNormalizedState(pool as unknown as Parameters<typeof readNormalizedState>[0],
      persistenceMode === 'typed' ? verifyTypedRecords : null);
    // Reading a stale revision must not replace a local write's newer CAS
    // baseline. The scheduler retries after concurrent writes settle.
    if (normalizedSnapshot !== previousSnapshot)
      throw new Error('Concurrent SQL write while refreshing scheduled state');
    normalizedSnapshot = refreshed;
    return refreshed.state;
  }
  if (persistenceMode === 'relational') {
    // Never silently fall back to a stale JSONB blob or empty seed.
    const previousSnapshot = relationalSnapshot;
    const refreshed = await readRelationalState(pool as unknown as Parameters<typeof readRelationalState>[0]);
    if (relationalSnapshot !== previousSnapshot)
      throw new Error('Concurrent relational write while refreshing scheduled state');
    relationalSnapshot = refreshed;
    return refreshed.state;
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS metadrive_platform_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const result = await pool.query('SELECT payload FROM metadrive_platform_state WHERE id = 1');
  return result.rows[0]?.payload ?? null;
}

// At most one in-flight and one pending complete-state snapshot are retained.
// Older snapshots can be superseded by the newest state within one process.
// Every caller resolves only after a snapshot at least as new has been committed.
type PersistWaiter = { resolve: () => void; reject: (error: unknown) => void };
let newestPayload: string | null = null;
let drainActive = false;
let writeFailure: unknown = null;
let waiting: PersistWaiter[] = [];
let idleWaiters: Array<() => void> = [];
const upsertStateSql = `INSERT INTO metadrive_platform_state (id, payload) VALUES (1, $1::jsonb)
  ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`;

async function drainStateWrites(): Promise<void> {
  while (newestPayload !== null) {
    const payload = newestPayload;
    newestPayload = null;
    const batch = waiting.splice(0);
    try {
      if (!pool) throw new Error('Database pool not available');
      if (persistenceMode === 'normalized' || persistenceMode === 'typed') {
        if (!normalizedSnapshot) throw new Error('Normalized SQL state must be verified before first write');
        normalizedSnapshot = await writeNormalizedState(
          pool as unknown as Parameters<typeof writeNormalizedState>[0],
          JSON.parse(payload), normalizedSnapshot,
          persistenceMode === 'typed' ? synchronizeTypedRecords : null,
          true // queue has already JSON.parse'd this payload
        );
      } else if (persistenceMode === 'relational') {
        if (!relationalSnapshot) throw new Error('Relational database must be verified before first write');
        relationalSnapshot = await writeRelationalState(
          pool as unknown as Parameters<typeof writeRelationalState>[0], JSON.parse(payload), relationalSnapshot
        );
      } else {
        await pool.query(upsertStateSql, [payload]);
      }
      writeFailure = null;
      for (const waiter of batch) waiter.resolve();
    } catch (error) {
      writeFailure = error;
      console.error('CRITICAL: MetaDrive PostgreSQL persistence failed', error);
      if (persistenceMode !== 'jsonb') process.exitCode = 1;
      for (const waiter of [...batch, ...waiting.splice(0)]) waiter.reject(error);
      newestPayload = null;
      break;
    }
  }
  drainActive = false;
  for (const done of idleWaiters.splice(0)) done();
}
export function persistToPostgres(state: unknown, preSerialized?: string): Promise<unknown> {
  if (!pool) return Promise.resolve();
  if (writeFailure !== null && persistenceMode !== 'jsonb') return Promise.reject(writeFailure);
  const payload = preSerialized ?? JSON.stringify(state);
  return new Promise<void>((resolve, reject) => {
    newestPayload = payload;
    waiting.push({ resolve, reject });
    if (!drainActive) {
      drainActive = true;
      void drainStateWrites();
    }
  });
}

// Await both the pending snapshot and any active durable PostgreSQL commit.
export async function waitForPersistedState(): Promise<void> {
  if (drainActive) await new Promise<void>((resolve) => idleWaiters.push(resolve));
  if (writeFailure !== null) throw writeFailure;
}

export async function closeStateStore(): Promise<void> {
  if (drainActive) await new Promise<void>((resolve) => idleWaiters.push(resolve));
  if (writeFailure !== null) throw writeFailure;
  if (pool) await pool.end();
}

// Optional tenant-scoped route-alias SQL registry; never silently fall back to JSONB.
export function getRouteAliasPool() { return pool; }
/**
 * Durable logout tombstones are isolated from the large metadata state graph.
 * This table contains only signed-token IDs, hashed refresh-token identifiers
 * and expiry metadata. No bearer tokens, credentials or JSON columns.
 * Verified startup merges the tombstones after reading the canonical SQL tree.
 */
export type AuthLogoutRevocation = {
  jti: string;
  tenantId: string;
  userId: string;
  refreshHash: string | null;
  accessExpiresAt: number;
  refreshExpiresAt: number | null;
  revokedAt: number;
};
const authLogoutTableSql = `CREATE TABLE IF NOT EXISTS md_auth_logout_revocations (
  jti TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  refresh_token_hash TEXT,
  access_expires_at DOUBLE PRECISION NOT NULL,
  refresh_expires_at DOUBLE PRECISION,
  revoked_at DOUBLE PRECISION NOT NULL
)`;
let authLogoutSchemaReady: Promise<void> | null = null;
async function ensureAuthLogoutTable(): Promise<void> {
  if (!pool || persistenceMode !== 'typed') return;
  if (!authLogoutSchemaReady) {
    authLogoutSchemaReady = pool.query(authLogoutTableSql).then(() => undefined)
      .catch((error: unknown) => {
        authLogoutSchemaReady = null;
        throw error;
      });
  }
  await authLogoutSchemaReady;
}
export async function readAuthLogoutRevocations(): Promise<AuthLogoutRevocation[]> {
  if (persistenceMode !== 'typed') return [];
  if (!pool) throw Error('Typed SQL logout revocation store requires PostgreSQL');
  await ensureAuthLogoutTable();
  const now = Date.now() / 1000;
  const result = await pool.query(
    `SELECT jti,tenant_id,user_id,refresh_token_hash,access_expires_at,refresh_expires_at,revoked_at
       FROM md_auth_logout_revocations
       WHERE access_expires_at>$1 OR refresh_expires_at>$1`, [now]);
  return result.rows.map((row) => ({
    jti: String(row.jti),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    refreshHash: row.refresh_token_hash === null ? null : String(row.refresh_token_hash),
    accessExpiresAt: Number(row.access_expires_at),
    refreshExpiresAt: row.refresh_expires_at === null ? null : Number(row.refresh_expires_at),
    revokedAt: Number(row.revoked_at)
  }));
}
export async function persistAuthLogoutRevocation(revocation: AuthLogoutRevocation): Promise<void> {
  if (persistenceMode !== 'typed' || !pool) throw Error('Typed SQL logout revocation store unavailable');
  if (!revocation.jti || !revocation.tenantId || !revocation.userId ||
      !Number.isFinite(revocation.accessExpiresAt) || !Number.isFinite(revocation.revokedAt))
    throw Error('Invalid durable logout revocation');
  await ensureAuthLogoutTable();
  // An individual INSERT is an atomic, durable PostgreSQL transaction. Do not
  // return a 204 before it commits; its failure must leave logout unacknowledged.
  await pool.query(
    `INSERT INTO md_auth_logout_revocations
      (jti,tenant_id,user_id,refresh_token_hash,access_expires_at,refresh_expires_at,revoked_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (jti) DO NOTHING`,
    [revocation.jti,revocation.tenantId,revocation.userId,revocation.refreshHash,
     revocation.accessExpiresAt,revocation.refreshExpiresAt,revocation.revokedAt]);
}
