// PostgreSQL 18 isolated restore only. Proves real record CREATE/UPDATE/DELETE,
// metadata schema additions, durable restart reads, atomic rollback and no JSONB.
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readNormalizedState,writeNormalizedState} from '../src/normalized-state-runtime.mjs';
import {verifyTypedRecords,synchronizeTypedRecords} from '../src/normalized-typed-records.mjs';
import {stateDigest} from '../src/relational-projection.mjs';
import {physicalObjectTable} from '../src/normalized-object-schema.mjs';

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
  // User is a dedicated authentication identity, not an ordinary Object CRUD
  // candidate. Exercising User as business data could alter restored login
  // identities and incorrectly require a redundant physical SQL User table.
  const businessObjects=tenant.objects.filter(o=>o.apiName!=='User');
  const object=businessObjects.find(o=>Array.isArray(o.fields)&&o.fields.some(f=>f.apiName==='Name'&&/^(Text|Name)/i.test(f.dataType))) ??
     businessObjects.find(o=>Array.isArray(o.fields));
  if(!object) throw Error('No metadata object suitable for typed SQL CRUD testing');
  const objectId=object.apiName, id='SQL-MIGRATION-PROOF-'+randomUUID();
  const companionId='SQL-MIGRATION-PROOF-'+randomUUID();
  const hadRecordBucket=Object.prototype.hasOwnProperty.call(tenant.records,objectId);
  const original=stateDigest(initial.state);
  let after=structuredClone(initial.state);
  if(!Array.isArray(after.tenants[tenantId].records[objectId]))
    after.tenants[tenantId].records[objectId]=[];
  const nameDefined=object.fields.some(f=>f.apiName==='Name');
  const inserted={Id:id,...(nameDefined?{Name:'Typed_SQL_Proof_Initial'}:{})};
  after.tenants[tenantId].records[objectId].push(inserted);
  after.tenants[tenantId].records[objectId].push({Id:companionId,...(nameDefined?{Name:'Untouched_SQL_Companion'}:{})});
  active=await save(after,active);
  if(!(await read()).state.tenants[tenantId].records[objectId].some(r=>r.Id===id))
    throw Error('Record CREATE not durable in SQL');
  const objectMapping=await pool.query('SELECT object_id FROM md_v2_object_registry WHERE tenant_id=$1 AND api_name=$2 AND active=true',[tenantId,objectId]);
  if(objectMapping.rowCount!==1) throw Error('Missing physical object registry for delta proof');
  const tableName=physicalObjectTable(objectMapping.rows[0].object_id);
  const companionVersion=await pool.query('SELECT record_version FROM '+tableName+' WHERE tenant_id=$1 AND record_id=$2',[tenantId,companionId]);
  if(companionVersion.rowCount!==1) throw Error('Companion record not persisted');
  if(nameDefined){
    after=structuredClone(active.state);
    const item=after.tenants[tenantId].records[objectId].find(r=>r.Id===id);
    item.Name='Typed_SQL_Proof_Edited';
    active=await save(after,active);
    const reread=await read();
    if(reread.state.tenants[tenantId].records[objectId].find(r=>r.Id===id)?.Name!=='Typed_SQL_Proof_Edited')
      throw Error('Record UPDATE not durable in typed SQL');
    const companionAfter=await pool.query('SELECT record_version FROM '+tableName+' WHERE tenant_id=$1 AND record_id=$2',[tenantId,companionId]);
    if(companionAfter.rows[0]?.record_version!==companionVersion.rows[0].record_version)
      throw Error('Record UPDATE rewrote an unchanged physical SQL row');
  }
  after=structuredClone(active.state);
  after.tenants[tenantId].records[objectId]=after.tenants[tenantId].records[objectId].filter(r=>r.Id!==id&&r.Id!==companionId);
  if(!hadRecordBucket) delete after.tenants[tenantId].records[objectId];
  active=await save(after,active);
  const gone=await read();
  if((gone.state.tenants[tenantId].records[objectId]??[]).some(r=>r.Id===id||r.Id===companionId))
    throw Error('Record DELETE not durable in typed SQL');
  if(stateDigest(gone.state)!==original) throw Error('CRUD rollback did not exactly restore source snapshot');
  const sqlRecordRegistry=await pool.query('SELECT count(*)::int AS n FROM md_v2_object_registry WHERE active=true');
  if(sqlRecordRegistry.rows[0].n!==tenant.objects.length) throw Error('Typed object registry count differs after CRUD');
  // Metadata object retirement and reactivation must retain immutable typed
  // field column identities and existing values, without duplicate registry rows.
  const temporaryApi='SQL_Reactivation_Proof__c';
  if(tenant.objects.some(o=>o.apiName===temporaryApi)) throw Error('Proof object already exists');
  const temporaryObject={apiName:temporaryApi,label:'SQL Reactivation Proof',
    pluralLabel:'SQL Reactivation Proofs',fields:[{apiName:'Name',label:'Name',dataType:'Text'}]};
  const temporaryId='SQL-REACTIVATION-'+randomUUID();
  after=structuredClone(active.state);
  after.tenants[tenantId].objects.push(temporaryObject);
  after.tenants[tenantId].records[temporaryApi]=[{Id:temporaryId,Name:'Preserved through retirement'}];
  active=await save(after,active);
  const beforeRetirement=await pool.query(
    'SELECT object_id FROM md_v2_object_registry WHERE tenant_id=$1 AND api_name=$2 AND active=true',[tenantId,temporaryApi]);
  if(beforeRetirement.rowCount!==1) throw Error('New metadata object has no typed table');
  const registryId=beforeRetirement.rows[0].object_id;
  const beforeFields=await pool.query(
    'SELECT field_id,physical_column FROM md_v2_field_registry WHERE object_id=$1 AND api_name=$2 AND active=true',
    [registryId,'Name']);
  if(beforeFields.rowCount!==1) throw Error('Temporary typed field was not registered');
  after=structuredClone(active.state);
  after.tenants[tenantId].objects=after.tenants[tenantId].objects.filter(o=>o.apiName!==temporaryApi);
  delete after.tenants[tenantId].records[temporaryApi];
  active=await save(after,active);
  after=structuredClone(active.state);
  after.tenants[tenantId].objects.push(temporaryObject);
  after.tenants[tenantId].records[temporaryApi]=[{Id:temporaryId,Name:'Preserved through retirement'}];
  active=await save(after,active);
  const afterFields=await pool.query(
    'SELECT field_id,physical_column FROM md_v2_field_registry WHERE object_id=$1 AND api_name=$2 AND active=true',
    [registryId,'Name']);
  if(afterFields.rowCount!==1||afterFields.rows[0].field_id!==beforeFields.rows[0].field_id
    ||afterFields.rows[0].physical_column!==beforeFields.rows[0].physical_column)
    throw Error('Object reactivation regenerated or duplicated a SQL field identity');
  if(!(await read()).state.tenants[tenantId].records[temporaryApi].some(r=>r.Id===temporaryId))
    throw Error('Typed records did not survive object reactivation');
  after=structuredClone(active.state);
  after.tenants[tenantId].objects=after.tenants[tenantId].objects.filter(o=>o.apiName!==temporaryApi);
  delete after.tenants[tenantId].records[temporaryApi];
  active=await save(after,active);
  if(stateDigest((await read()).state)!==original) throw Error('Reactivation proof changed source tenant data');
  console.log(JSON.stringify({isolatedRestoreOnly:true,typedSqlCrud:true,create:true,
    update:nameDefined,delete:true,unrelatedRowVersionPreserved:nameDefined,objectReactivation:true,
    fullSnapshotReversible:true,noJsonColumns:true,
    objects:sqlRecordRegistry.rows[0].n,version:gone.version}));
}catch(error){
  console.error('Typed SQL record execution proof failed:',error instanceof Error?error.message:'UnknownError');
  process.exitCode=1;
}finally{await pool.end();}
