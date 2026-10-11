// Read-only check of live MetaDrive state or a restored copy.
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { projectState, verifyProjection } from '../src/relational-projection.mjs';
if(!process.env.DATABASE_URL) throw Error('Database connection secret unavailable');
const u=new URL(process.env.DATABASE_URL);
const localHost=['localhost','127.0.0.1','::1'].includes(u.hostname);
const aivenRequire=u.hostname.toLowerCase().endsWith('.aivencloud.com') && u.searchParams.get('sslmode')==='require';
if(process.env.PGSSLMODE==='disable' && !localHost)
  throw Error('Unencrypted remote PostgreSQL access is not allowed');
for(const k of ['sslmode','sslcert','sslkey','sslrootcert']) u.searchParams.delete(k);
const client=new pg.Client({
  connectionString:u.toString(),
  ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:!aivenRequire},
  connectionTimeoutMillis:15000
});
try {
  await client.connect();
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const ssl=await client.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()");
    if(!localHost && ssl.rows[0]?.ssl!==true)throw Error('Remote PostgreSQL connection is not TLS');
    const t=await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
    if(t.rowCount!==1) throw Error('Wrong database: missing MetaDrive source state');
    const verified=verifyProjection(t.rows[0].payload,projectState(t.rows[0].payload));
    if(process.env.METADRIVE_DIGEST_FILE) writeFileSync(process.env.METADRIVE_DIGEST_FILE,verified.digest+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({sourceVerified:true,sha256:verified.digest,counts:verified.counts}));
  } finally {await client.query('ROLLBACK');}
} finally {await client.end();}
