import pg from 'pg';
import { readRelationalState, writeRelationalState, type RelationalSnapshot } from './relational-runtime.mjs';

const { Pool } = pg;
// Production remains JSONB until explicit, verified relational cutover.
export const persistenceMode = process.env.METADRIVE_PERSISTENCE_MODE ?? 'jsonb';
if (!['jsonb', 'relational'].includes(persistenceMode)) throw new Error('Invalid METADRIVE_PERSISTENCE_MODE');
let relationalSnapshot: RelationalSnapshot | null = null;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required for persistent UNEEngine state');

// Keep SSL configuration in one place: pg URL sslmode options otherwise override the trusted CA.
const databaseUrl = new URL(connectionString);
for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) databaseUrl.searchParams.delete(key);

const pool = new Pool({
  connectionString: databaseUrl.toString(),
  ssl: process.env.PGSSLMODE === 'disable' ? false : {
    rejectUnauthorized: process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT !== 'true',
    ...(process.env.METADRIVE_DB_CA_CERT ? { ca: process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g, '\n') } : {})
  },
  max: 3,
  connectionTimeoutMillis: 15000
});

export async function readPersistedState(): Promise<unknown | null> {
  if (persistenceMode === 'relational') {
    // Never silently fall back to a stale JSONB blob or empty seed.
    relationalSnapshot = await readRelationalState(pool as unknown as Parameters<typeof readRelationalState>[0]);
    return relationalSnapshot.state;
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
      if (persistenceMode === 'relational') {
        if (!relationalSnapshot) throw new Error('Relational database must be verified before first write');
        relationalSnapshot = await writeRelationalState(
          pool as unknown as Parameters<typeof writeRelationalState>[0], JSON.parse(payload), relationalSnapshot
        );
      } else {
        await pool.query(upsertStateSql, [payload]);
      }
      for (const waiter of batch) waiter.resolve();
    } catch (error) {
      writeFailure = error;
      console.error('CRITICAL: MetaDrive PostgreSQL persistence failed', error);
      process.exitCode = 1;
      for (const waiter of [...batch, ...waiting.splice(0)]) waiter.reject(error);
      newestPayload = null;
      break;
    }
  }
  drainActive = false;
  for (const done of idleWaiters.splice(0)) done();
}
export function persistToPostgres(state: unknown): Promise<unknown> {
  if (writeFailure !== null) return Promise.reject(writeFailure);
  const payload = JSON.stringify(state);
  return new Promise<void>((resolve, reject) => {
    newestPayload = payload;
    waiting.push({ resolve, reject });
    if (!drainActive) {
      drainActive = true;
      void drainStateWrites();
    }
  });
}

export async function closeStateStore(): Promise<void> {
  if (drainActive) await new Promise<void>((resolve) => idleWaiters.push(resolve));
  if (writeFailure !== null) throw writeFailure;
  await pool.end();
}
