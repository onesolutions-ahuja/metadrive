// Measures read/write cost of the full metadata + record compatibility model
// on a disposable restored Aiven database. Never connects to production.
import pg from 'pg';
import {performance} from 'node:perf_hooks';
import {readNormalizedState,writeNormalizedState} from '../src/normalized-state-runtime.mjs';
if(!process.env.DATABASE_URL) throw Error('Isolated restore URL required');
const u=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1','::1'].includes(u.hostname)||u.pathname!=='/metadrive_restored'||
  process.env.PGSSLMODE!=='disable') throw Error('Only isolated local restore benchmarking is permitted');
const pool=new pg.Pool({connectionString:u.toString(),ssl:false,max:2});
try {
  const reads=[],writes=[];
  for(let n=0;n<3;n++){
    let t=performance.now();
    const previous=await readNormalizedState(pool);
    reads.push(Math.round(performance.now()-t));
    const next=structuredClone(previous.state);
    const tenantId=Object.keys(next.tenants??{})[0];
    if(!tenantId) throw Error('No tenant for SQL benchmark');
    // The isolated database alone receives the synthetic benchmark marker.
    next.tenants[tenantId].scheduleRetries={
      ...(next.tenants[tenantId].scheduleRetries??{}),
      __normalized_sql_benchmark:n
    };
    t=performance.now();
    await writeNormalizedState(pool,next,previous);
    writes.push(Math.round(performance.now()-t));
    const check=await readNormalizedState(pool);
    if(check.state.tenants[tenantId].scheduleRetries.__normalized_sql_benchmark!==n)
      throw Error('Normalized SQL benchmark lost a persisted change');
  }
  console.log(JSON.stringify({onlyIsolatedRestore:true,checks:3,readMs:reads,writeMs:writes,
    p95WriteMs:Math.max(...writes),p95ReadMs:Math.max(...reads)}));
} finally {await pool.end();}
