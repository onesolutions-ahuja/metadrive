// Read-only check of live MetaDrive state or a restored copy.
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { projectState, verifyProjection } from '../src/relational-projection.mjs';
if(!process.env.DATABASE_URL) throw Error('Database connection secret unavailable');
const u=new URL(process.env.DATABASE_URL);
for(const k of ['sslmode','sslcert','sslkey','sslrootcert']) u.searchParams.delete(k);
const client=new pg.Client({
  connectionString:u.toString(),
  ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:true},
  connectionTimeoutMillis:15000
});
try {
  await client.connect();
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const t=await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
    if(t.rowCount!==1) throw Error('Wrong database: missing MetaDrive source state');
    const verified=verifyProjection(t.rows[0].payload,projectState(t.rows[0].payload));
    if(process.env.METADRIVE_DIGEST_FILE) writeFileSync(process.env.METADRIVE_DIGEST_FILE,verified.digest+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({sourceVerified:true,sha256:verified.digest,counts:verified.counts}));
  } finally {await client.query('ROLLBACK');}
} finally {await client.end();}
