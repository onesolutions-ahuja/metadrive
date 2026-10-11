// Execute only on an independently restored Aiven snapshot running on LOCAL postgres.
// Production connections are refused even if credentials accidentally leak into env.
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {stateDigest} from '../src/relational-projection.mjs';
import {initializeNormalizedState,readNormalizedState} from '../src/normalized-state-runtime.mjs';
if(process.argv.length!==3||process.argv[2]!=='--apply')
  throw Error('Use --apply on an isolated restore only');
if(!process.env.DATABASE_URL) throw Error('Local restored DATABASE_URL required');
const url=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1','::1'].includes(url.hostname)
  ||url.pathname!=='/metadrive_restored'
  ||process.env.PGSSLMODE!=='disable') throw Error('Refusing any non-restored production connection');
const pool=new pg.Pool({connectionString:url.toString(),ssl:false,max:2,connectionTimeoutMillis:15000});
try {
  const client=await pool.connect();
  let begun=false;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    begun=true;
    await client.query("SET LOCAL statement_timeout='180s'");
    const baseline=await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1 FOR SHARE');
    if(baseline.rowCount!==1) throw Error('Source platform snapshot missing');
    const original=baseline.rows[0].payload;
    const digest=stateDigest(original);
    if((await client.query("SELECT to_regclass('md_v3_runtime') AS name")).rows[0]?.name)
      throw Error('Existing normalized state; refusing second seed');
    await client.query(await readFile(new URL('../sql/normalized-state-v3.sql',import.meta.url),'utf8'));
    const {nodeCount}=await initializeNormalizedState(client,original);
    const repeat=await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
    if(stateDigest(repeat.rows[0]?.payload)!==digest) throw Error('Legacy source changed during copy');
    const parsed=await client.query('SELECT COUNT(*)::int AS total FROM md_v3_state_nodes WHERE revision=0');
    if(parsed.rows[0].total!==nodeCount) throw Error('Typed SQL node count mismatch');
    await client.query('COMMIT');
    begun=false;
    const verified=await readNormalizedState(pool);
    if(verified.digest!==digest) throw Error('Full restored SQL state failed integrity readback');
    const metadata=original.tenants??{};
    const counts={tenants:Object.keys(metadata).length,
      records:Object.values(metadata).reduce((n,t)=>n+Object.values(t.records??{}).reduce((z,list)=>z+(Array.isArray(list)?list.length:0),0),0),
      flows:Object.values(metadata).reduce((n,t)=>n+(Array.isArray(t.flows)?t.flows.length:0),0),
      pages:Object.values(metadata).reduce((n,t)=>n+(Array.isArray(t.pages)?t.pages.length:0),0),
      namedCredentials:Object.values(metadata).reduce((n,t)=>n+(Array.isArray(t.namedCredentials)?t.namedCredentials.length:0),0)};
    console.log(JSON.stringify({verified:true,sourceUnchanged:true,sqlContainsJsonb:false,nodeCount,counts}));
  } catch(error) {
    if(begun) await client.query('ROLLBACK');
    console.error('Isolated SQL state projection failed and was rolled back',error?.name??'UnknownError');
    process.exitCode=1;
  } finally {client.release();}
} finally {await pool.end();}
