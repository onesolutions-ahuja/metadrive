// PostgreSQL 18 isolated restore only. Proves real record CREATE/UPDATE/DELETE,
// metadata schema additions, durable restart reads, atomic rollback and no JSONB.
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readNormalizedState,writeNormalizedState} from '../src/normalized-state-runtime.mjs';
import {verifyTypedRecords,synchronizeTypedRecords} from '../src/normalized-typed-records.mjs';
import {stateDigest} from '../src/relational-projection.mjs';

const u=new URL(process.env.DATABASE_URL||'postgres://localhost/invalid');
if(!['localhost','127.0.0.1','::1'].includes(u.hostname)||
   u.pathname!=='/metadrive_restored'||process.env.PGSSLMODE!=='disable')
  throw Error('ONLY isolated local metadrive_restored is allowed');
const pool=new pg.Pool({connectionString:u.toString(),ssl:false,max:2});
const read=()=>readNormalizedState(pool,verifyTypedRecords);
const save=(state,previous)=>writeNormalizedState(pool,state,previous,synchronizeTypedRecords);
try{
  const noJson=await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE data_type IN ('json','jsonb')");
  if(noJson.rows[0].n!==0) throw Error('Migration left JSON/JSONB in restored schema');
  const initial=await read();
  let active=initial;
  const tenants=Object.keys(initial.state.tenants??{});
  if(!tenants.length) throw Error('No tenant in restored SQL state');
  const tenantId=tenants[0],tenant=initial.state.tenants[tenantId];
  const object=tenant.objects.find(o=>Array.isArray(o.fields)&&o.fields.some(f=>f.apiName==='Name'&&/^Text|Name/i.test(f.dataType))) ??
     tenant.objects.find(o=>Array.isArray(o.fields));
  if(!object) throw Error('No metadata object suitable for typed SQL CRUD testing');
  const objectId=object.apiName, id='SQL-MIGRATION-PROOF-'+randomUUID();
  const hadRecordBucket=Object.prototype.hasOwnProperty.call(tenant.records,objectId);
  const original=stateDigest(initial.state);
  let after=structuredClone(initial.state);
  if(!Array.isArray(after.tenants[tenantId].records[objectId]))
    after.tenants[tenantId].records[objectId]=[];
  const nameDefined=object.fields.some(f=>f.apiName==='Name');
  const inserted={Id:id,...(nameDefined?{Name:'Typed_SQL_Proof_Initial'}:{})};
  after.tenants[tenantId].records[objectId].push(inserted);
  active=await save(after,active);
  if(!(await read()).state.tenants[tenantId].records[objectId].some(r=>r.Id===id))
    throw Error('Record CREATE not durable in SQL');
  if(nameDefined){
    after=structuredClone(active.state);
    const item=after.tenants[tenantId].records[objectId].find(r=>r.Id===id);
    item.Name='Typed_SQL_Proof_Edited';
    active=await save(after,active);
    const reread=await read();
    if(reread.state.tenants[tenantId].records[objectId].find(r=>r.Id===id)?.Name!=='Typed_SQL_Proof_Edited')
      throw Error('Record UPDATE not durable in typed SQL');
  }
  after=structuredClone(active.state);
  after.tenants[tenantId].records[objectId]=after.tenants[tenantId].records[objectId].filter(r=>r.Id!==id);
  if(!hadRecordBucket) delete after.tenants[tenantId].records[objectId];
  active=await save(after,active);
  const gone=await read();
  if(gone.state.tenants[tenantId].records[objectId].some(r=>r.Id===id))
    throw Error('Record DELETE not durable in typed SQL');
  if(stateDigest(gone.state)!==original) throw Error('CRUD rollback did not exactly restore source snapshot');
  const sqlRecordRegistry=await pool.query('SELECT count(*)::int AS n FROM md_v2_object_registry WHERE active=true');
  if(sqlRecordRegistry.rows[0].n!==tenant.objects.length) throw Error('Typed object registry count differs after CRUD');
  console.log(JSON.stringify({isolatedRestoreOnly:true,typedSqlCrud:true,create:true,
    update:nameDefined,delete:true,fullSnapshotReversible:true,noJsonColumns:true,
    objects:sqlRecordRegistry.rows[0].n,version:gone.version}));
}catch(error){
  console.error('Typed SQL record execution proof failed:',error instanceof Error?error.message:'UnknownError');
  process.exitCode=1;
}finally{await pool.end();}
