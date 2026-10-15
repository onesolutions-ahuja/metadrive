import pg from 'pg';
import {loadAppSeedCatalog} from './seeders/catalog.mjs';
import {recordInstalledAppPackageVersions} from './seeders/registry.mjs';
import type {SeedSqlClient} from './seeders/registry.mjs';
import { readRelationalState, writeRelationalState, type RelationalSnapshot } from './relational-runtime.mjs';
import { readNormalizedState, writeNormalizedState, type NormalizedSnapshot } from './normalized-state-runtime.mjs';
import {synchronizeTypedRecords,verifyTypedRecords} from './normalized-typed-records.mjs';

const { Pool } = pg;
const sqlAppSeedCatalog=loadAppSeedCatalog();
const commitInstalledAppVersions=(client: SeedSqlClient, state: unknown) =>
  recordInstalledAppPackageVersions(client, state, sqlAppSeedCatalog);
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
 * Authentication writes do not require traversing the platform metadata graph.
 * A separate warm, single-connection pool prevents a long Flow/scheduler SQL
 * query from queuing an independent login. Same DB/TLS configuration.
 */
const authPool = databaseUrl && persistenceMode === 'typed' ? new Pool({
  connectionString: databaseUrl.toString(),
  ssl: process.env.PGSSLMODE === 'disable' ? false : {
    rejectUnauthorized: process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT !== 'true',
    ...(process.env.METADRIVE_DB_CA_CERT ? { ca: process.env.METADRIVE_DB_CA_CERT.replace(/\\\\n/g, '\\n') } : {})
  },
  max: 1,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 600000,
  keepAlive: true
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
    // Scheduler refresh can overlap an ordinary API commit in this process.
    // Serialize against the local writer, then discard any read whose CAS
    // baseline changed while SQL was being fetched. Never install stale state.
    for (let attempt = 0; attempt < 5; attempt++) {
      await waitForPersistedState();
      const previousSnapshot = normalizedSnapshot;
      const refreshed = await readNormalizedState(pool as unknown as Parameters<typeof readNormalizedState>[0],
        persistenceMode === 'typed' ? verifyTypedRecords : null);
      if (normalizedSnapshot !== previousSnapshot) continue;
      normalizedSnapshot = refreshed;
      return refreshed.state;
    }
    throw new Error('Concurrent SQL write while refreshing scheduled state');
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
  if (!result.rows[0]?.payload) return null;
  // SQL owns refresh sessions even while the metadata snapshot is JSONB.
  await ensureLegacySqlSessions();
  const sessions = await pool.query('SELECT token_hash,family_id,user_id,tenant_id,expires_at,used_at,revoked_at,extra FROM metadrive_rel_refresh_sessions ORDER BY position ASC');
  const refreshSessions = sessions.rows.map((row: Record<string, any>) => ({
    ...row.extra, tokenHash: row.token_hash, familyId: row.family_id,
    userId: row.user_id, tenantId: row.tenant_id, expiresAt: row.expires_at,
    usedAt: row.used_at, revokedAt: row.revoked_at
  }));
  return { ...result.rows[0].payload, refreshSessions };
}

// At most one in-flight and one pending complete-state snapshot are retained.
// Older snapshots can be superseded by the newest state within one process.
// Every caller resolves only after a snapshot at least as new has been committed.
type PersistWaiter = { resolve: () => void; reject: (error: unknown) => void };
let newestPayload: string | null = null;
let newestSessions: unknown[] = [];
const legacySessionTableSql = `CREATE TABLE IF NOT EXISTS metadrive_rel_refresh_sessions (
 token_hash TEXT PRIMARY KEY, position INTEGER NOT NULL, family_id TEXT NOT NULL,
 user_id TEXT NOT NULL, tenant_id TEXT NOT NULL, expires_at DOUBLE PRECISION NOT NULL,
 used_at DOUBLE PRECISION, revoked_at DOUBLE PRECISION,
 extra JSONB NOT NULL DEFAULT '{}'::jsonb
)`;
async function ensureLegacySqlSessions(): Promise<void> {
  if (!pool || persistenceMode !== 'jsonb') return;
  await pool.query(legacySessionTableSql);
}
let drainActive = false;
let writeFailure: unknown = null;
let waiting: PersistWaiter[] = [];
let idleWaiters: Array<() => void> = [];
const upsertStateSql = `INSERT INTO metadrive_platform_state (id, payload) VALUES (1, $1::jsonb)
  ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`;

// Initialise the canonical versioned seeder ledger in the SAME database and
// schema used by the runtime; a table on another service cannot protect writes.
let seedLedgerReady: Promise<void> | null = null;
let seedLedgerTenantConstraintPending = false;
function ensureSeedLedger(): Promise<void> {
  if (!pool) return Promise.reject(new Error('SQL ledger requires PostgreSQL'));
  if (!seedLedgerReady) seedLedgerReady = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS md_seed_package_versions (
      tenant_id TEXT NOT NULL,
      package_kind TEXT NOT NULL CHECK (package_kind IN ('core','shared','app')),
      package_key TEXT NOT NULL CHECK (length(trim(package_key)) BETWEEN 1 AND 160),
      package_version TEXT NOT NULL CHECK (length(trim(package_version)) BETWEEN 1 AND 80),
      definition_checksum CHAR(64) NOT NULL CHECK (length(definition_checksum) = 64),
      installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id,package_kind,package_key)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS md_seed_package_versions_kind_idx
      ON md_seed_package_versions (tenant_id,package_kind,updated_at DESC)`);
    // Fresh SQL-only tests create tenant tables during their first snapshot write.
    // Add the FK when the authoritative tenant table exists, without assuming
    // bootstrap ordering or removing the constraint from existing installations.
    const tenantTable = await pool.query("SELECT to_regclass('metadrive_rel_tenants')::text AS name");
    const tenantTableExists = Boolean((tenantTable.rows as Array<{name: string | null}>)[0]?.name);
    seedLedgerTenantConstraintPending = !tenantTableExists;
    if (tenantTableExists) {
      const fk = await pool.query(`SELECT 1 FROM pg_constraint
        WHERE contype = 'f' AND conrelid = 'md_seed_package_versions'::regclass
        AND confrelid = 'metadrive_rel_tenants'::regclass LIMIT 1`);
      if (!fk.rows.length) await pool.query(`ALTER TABLE md_seed_package_versions
        ADD CONSTRAINT md_seed_package_versions_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES metadrive_rel_tenants(tenant_id) ON DELETE RESTRICT`);
    }
  })().catch((error: unknown) => { seedLedgerReady = null; throw error; });
  return seedLedgerReady;
}
async function drainStateWrites(): Promise<void> {
  while (newestPayload !== null) {
    const payload = newestPayload;
    const newestSessionsForCommit = newestSessions;
    newestPayload = null;
    const batch = waiting.splice(0);
    try {
      if (!pool) throw new Error('Database pool not available');
      await ensureSeedLedger();
      if (persistenceMode === 'normalized' || persistenceMode === 'typed') {
        if (!normalizedSnapshot) throw new Error('Normalized SQL state must be verified before first write');
        normalizedSnapshot = await writeNormalizedState(
          pool as unknown as Parameters<typeof writeNormalizedState>[0],
          JSON.parse(payload), normalizedSnapshot,
          persistenceMode === 'typed' ? synchronizeTypedRecords : null,
          true, // queue has already JSON.parse'd this payload
          commitInstalledAppVersions
        );
      } else if (persistenceMode === 'relational') {
        if (!relationalSnapshot) throw new Error('Relational database must be verified before first write');
        relationalSnapshot = await writeRelationalState(
          pool as unknown as Parameters<typeof writeRelationalState>[0], JSON.parse(payload), relationalSnapshot,
          commitInstalledAppVersions
        );
      } else {
        await ensureLegacySqlSessions();
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(upsertStateSql, [payload]);
          await client.query('DELETE FROM metadrive_rel_refresh_sessions');
          await client.query(`INSERT INTO metadrive_rel_refresh_sessions
            (position,token_hash,family_id,user_id,tenant_id,expires_at,used_at,revoked_at,extra)
            SELECT ordinality-1, item->>'tokenHash',item->>'familyId',item->>'userId',
              item->>'tenantId',(item->>'expiresAt')::double precision,
              (item->>'usedAt')::double precision,(item->>'revokedAt')::double precision,
              item - 'tokenHash' - 'familyId' - 'userId' - 'tenantId' -
                'expiresAt' - 'usedAt' - 'revokedAt'
            FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS rows(item,ordinality)`,
            [JSON.stringify(newestSessionsForCommit)]);
          await commitInstalledAppVersions(client,JSON.parse(payload));
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally { client.release(); }
      }
      // On the first fresh-db snapshot the tenant table now exists. Attach FK.
      if (seedLedgerTenantConstraintPending) { seedLedgerReady = null; await ensureSeedLedger(); }
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
  const record = state as { refreshSessions?: unknown[] };
  const sessions = Array.isArray(record.refreshSessions) ? record.refreshSessions : [];
  const payload = persistenceMode === 'jsonb'
    ? JSON.stringify({ ...(state as object), refreshSessions: [] })
    : preSerialized ?? JSON.stringify(state);
  return new Promise<void>((resolve, reject) => {
    newestPayload = payload;
    newestSessions = sessions;
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
  if (authPool) await authPool.end();
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
  return (result.rows as unknown as Array<Record<string, unknown>>).map((row) => ({
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

/**
 * Typed SQL authentication session fast path.
 * The INSERT is atomic, returns only after commit and contains only hashed
 * refresh tokens, session fields and a security-audit event (never a cookie).
 * The startup overlay makes it safe if a full metadata snapshot predates login.
 */
export type DurableAuthLogin = {
  tokenHash: string; familyId: string; userId: string; tenantId: string;
  expiresAt: number; usedAt: number | null; revokedAt: number | null;
  mfaVerified: boolean; authVersion: number;
  auditId: string; auditAt: string;
};
const authLoginSchemaSql = `CREATE TABLE IF NOT EXISTS md_auth_login_sessions (
  token_hash TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  expires_at DOUBLE PRECISION NOT NULL,
  used_at DOUBLE PRECISION,
  revoked_at DOUBLE PRECISION,
  mfa_verified BOOLEAN NOT NULL,
  auth_version INTEGER NOT NULL,
  audit_id TEXT NOT NULL UNIQUE,
  audit_at TIMESTAMPTZ NOT NULL
)`;
let authLoginSchemaReady: Promise<void> | null = null;
async function ensureAuthLoginSchema(): Promise<void> {
  if (!authPool) throw Error('Typed SQL auth-session store unavailable');
  if (!authLoginSchemaReady) {
    authLoginSchemaReady = authPool.query(authLoginSchemaSql).then(() => undefined)
      .catch((error: unknown) => { authLoginSchemaReady = null; throw error; });
  }
  await authLoginSchemaReady;
}
export async function readDurableAuthLogins(): Promise<DurableAuthLogin[]> {
  if (persistenceMode !== 'typed') return [];
  await ensureAuthLoginSchema(); // Startup validates and warms the auth connection.
  const result = await authPool!.query(
    `SELECT token_hash,family_id,user_id,tenant_id,expires_at,used_at,revoked_at,
            mfa_verified,auth_version,audit_id,audit_at
       FROM md_auth_login_sessions ORDER BY audit_at ASC,token_hash ASC`);
  return result.rows.map((row: Record<string, unknown>) => ({
    tokenHash: String(row.token_hash), familyId: String(row.family_id),
    userId: String(row.user_id), tenantId: String(row.tenant_id),
    expiresAt: Number(row.expires_at),
    usedAt: row.used_at === null ? null : Number(row.used_at),
    revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
    mfaVerified: row.mfa_verified === true,
    authVersion: Number(row.auth_version),
    auditId: String(row.audit_id),
    auditAt: new Date(String(row.audit_at)).toISOString()
  }));
}
export async function persistDurableAuthLogin(entry: DurableAuthLogin): Promise<void> {
  if (persistenceMode !== 'typed' || !authPool) throw Error('Typed SQL auth-session store unavailable');
  if (!entry.tokenHash || !entry.familyId || !entry.userId || !entry.tenantId ||
      !entry.auditId || !Number.isFinite(entry.expiresAt) ||
      !Number.isSafeInteger(entry.authVersion) || !Number.isFinite(Date.parse(entry.auditAt)))
    throw Error('Invalid durable auth-session write');
  await ensureAuthLoginSchema();
  await authPool.query(
    `INSERT INTO md_auth_login_sessions
      (token_hash,family_id,user_id,tenant_id,expires_at,used_at,revoked_at,
       mfa_verified,auth_version,audit_id,audit_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [entry.tokenHash,entry.familyId,entry.userId,entry.tenantId,entry.expiresAt,
     entry.usedAt,entry.revokedAt,entry.mfaVerified,entry.authVersion,
     entry.auditId,entry.auditAt]);
}
