// CI ONLY: isolate each integration test's MetaDrive state in its own PostgreSQL
// schema, keyed by its existing METADRIVE_DATA_PATH. Production never loads this.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

if (process.env.METADRIVE_TEST_ISOLATION==='true' && process.env.METADRIVE_DATA_PATH) {
  const databaseUrl=process.env.DATABASE_URL;
  if (!databaseUrl) throw Error('Test isolation requires a disposable DATABASE_URL');
  const u=new URL(databaseUrl);
  if (!['localhost','127.0.0.1','::1'].includes(u.hostname) || u.pathname!=='/postgres')
    throw Error('Test database isolation refuses a non-local or non-disposable PostgreSQL connection');
  const schema='mtest_'+createHash('sha256').update(process.env.METADRIVE_DATA_PATH).digest('hex').slice(0,24);
  const {default:pg}=await import('pg');
  const admin=new pg.Client({connectionString:u.toString(),ssl:false,connectionTimeoutMillis:10000});
  await admin.connect();
  try {
    // Identifier is entirely generated from a fixed prefix and hex digest.
    await admin.query('CREATE SCHEMA IF NOT EXISTS '+schema);
    // Existing API regression tests create and deliberately edit their JSON
    // fixture between restarts. Import that isolated test fixture BEFORE the
    // server starts; only the separate relational test verifies SQL durability.
    if (existsSync(process.env.METADRIVE_DATA_PATH)) {
      const fixture=JSON.parse(readFileSync(process.env.METADRIVE_DATA_PATH,'utf8'));
      await admin.query('SET search_path TO '+schema);
      await admin.query("CREATE TABLE IF NOT EXISTS metadrive_platform_state (id INTEGER PRIMARY KEY CHECK(id=1), payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
      await admin.query("INSERT INTO metadrive_platform_state (id,payload) VALUES(1,$1::jsonb) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload, updated_at=now()",[JSON.stringify(fixture)]);
    }
  } finally {
    await admin.end();
  }
  u.searchParams.set('options','-csearch_path='+schema);
  process.env.DATABASE_URL=u.toString();
}
