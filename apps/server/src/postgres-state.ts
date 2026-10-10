import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required for persistent MetaDrive state');

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
  await pool.query(`CREATE TABLE IF NOT EXISTS metadrive_platform_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const result = await pool.query('SELECT payload FROM metadrive_platform_state WHERE id = 1');
  return result.rows[0]?.payload ?? null;
}

let pending: Promise<unknown> = Promise.resolve();
export function persistToPostgres(state: unknown): Promise<unknown> {
  const payload = JSON.stringify(state);
  const operation = pending.then(() => pool.query(
    `INSERT INTO metadrive_platform_state (id, payload) VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
    [payload]
  ));
  pending = operation.catch(error => {
    console.error('CRITICAL: MetaDrive PostgreSQL persistence failed', error);
    process.exitCode = 1;
    throw error;
  });
  return operation;
}

export async function closeStateStore(): Promise<void> {
  await pending;
  await pool.end();
}
