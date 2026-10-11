import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
// Test harnesses use isolated METADRIVE_DATA_PATH files, never a shared external database.
// This double gate cannot activate for normal production/server runs.
const testOnlyLocalState = process.env.NODE_ENV === 'test' && process.env.METADRIVE_TEST_MODE === 'true';
if (!connectionString && !testOnlyLocalState) throw new Error('DATABASE_URL is required for persistent UNEEngine state');

// Keep SSL configuration in one place: pg URL sslmode options otherwise override the trusted CA.
const databaseUrl = connectionString ? new URL(connectionString) : null;
if (databaseUrl) {
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) databaseUrl.searchParams.delete(key);
}
const pool = databaseUrl ? new Pool({
  connectionString: databaseUrl.toString(),
  ssl: process.env.PGSSLMODE === 'disable' ? false : {
    rejectUnauthorized: process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT !== 'true',
    ...(process.env.METADRIVE_DB_CA_CERT ? { ca: process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g, '\n') } : {})
  },
  max: 3,
  connectionTimeoutMillis: 15000
}) : null;

export async function readPersistedState(): Promise<unknown | null> {
  if (!pool) return null;
  await pool.query(`CREATE TABLE IF NOT EXISTS metadrive_platform_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const result = await pool.query('SELECT payload FROM metadrive_platform_state WHERE id = 1');
  return result.rows[0]?.payload ?? null;
}

let pending: Promise<void> = Promise.resolve();
let lastWriteFailure: Error | null = null;
export function persistToPostgres(state: unknown, preSerialized?: string): Promise<unknown> {
  if (!pool) return Promise.resolve();
  const payload = preSerialized ?? JSON.stringify(state);
  // An earlier connection failure must not poison every later database write.
  // Keep the queue ordered, catch the failure on the queue itself, and let callers
  // use waitForPersistedState to prevent outbound effects before durable storage.
  const operation = pending.then(() => pool.query(
    `INSERT INTO metadrive_platform_state (id, payload) VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
    [payload]
  ));
  pending = operation.then(
    () => { lastWriteFailure = null; },
    (error: unknown) => {
      lastWriteFailure = error instanceof Error ? error : new Error(String(error));
      console.error('CRITICAL: MetaDrive PostgreSQL persistence failed', lastWriteFailure);
    }
  );
  return operation;
}

export async function waitForPersistedState(): Promise<void> {
  await pending;
  if (lastWriteFailure) throw lastWriteFailure;
}

export async function closeStateStore(): Promise<void> {
  await pending;
  if (pool) await pool.end();
}
