// Logical backup/restore rehearsal against disposable CI PostgreSQL only.
// Never point this script at an Aiven or Railway database.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
const raw=process.env.METADRIVE_SQL_TEST_DATABASE_URL;
if(!raw)throw new Error('Isolated SQL test database is required');
const origin=new URL(raw);
if(!['127.0.0.1','localhost'].includes(origin.hostname)||!/^metadrive_test$/.test(origin.pathname.slice(1)))
 throw new Error('Restore rehearsal refuses non-local or non-test databases');
const {SqlPersistence}=await import(new URL('../dist-system/system-files/sql-persistence.js',import.meta.url).href);
const source=new SqlPersistence(raw);
const destination='metadrive_restore_'+randomBytes(5).toString('hex');
const local=mkdtempSync(join(tmpdir(),'metadrive-recovery-'));
const dump=join(local,'isolated-fixture.dump');
const processEnv={...process.env,PGPASSWORD:decodeURIComponent(origin.password)};
const common=['-h',origin.hostname,'-p',origin.port||'5432','-U',decodeURIComponent(origin.username)];
const command=(exe,args)=>{
 const result=spawnSync(exe,args,{encoding:'utf8',env:processEnv,timeout:120000});
 if(result.error||result.status!==0)
  throw new Error(exe+' failed: '+String(result.error?.message??result.stderr).slice(0,500));
};
let restore;
try{
 const count=async(db)=> {
  const {rows:[r]}=await db.query(`SELECT
   (SELECT count(*)::integer FROM md_records) AS records,
   (SELECT count(*)::integer FROM md_record_values) AS values,
   (SELECT count(*)::integer FROM md_system_migrations) AS migrations,
   (SELECT count(*)::integer FROM md_tenants) AS tenants,
   (SELECT count(*)::integer FROM md_durable_job_history) AS transitions,
   (SELECT count(*)::integer FROM md_http_callout_receipts) AS receipts`);
  return r;
 };
 const before=await count(source);
 command('pg_dump',[...common,'-d',origin.pathname.slice(1),'-Fc','-f',dump]);
 await source.query('CREATE DATABASE '+destination);
 command('pg_restore',[...common,'-d',destination,'--no-owner','--no-privileges',dump]);
 const target=new URL(raw);
 target.pathname='/'+destination;
 restore=new SqlPersistence(target.toString());
 const after=await count(restore);
 assert.deepEqual(after,before,'logical restoration altered SQL record or metadata counts');
 await restore.verifySchema();
 const {rows:[orphans]}=await restore.query(`SELECT count(*)::integer AS missing
 FROM md_record_values v LEFT JOIN md_records r
 ON r.tenant_id=v.tenant_id AND r.id=v.record_id WHERE r.id IS NULL`);
 assert.equal(orphans.missing,0);
 console.info('Isolated logical backup/restore, migration ledger and SQL integrity: PASS');
}finally{
 if(restore)await restore.close();
 try{await source.query('DROP DATABASE IF EXISTS '+destination+' WITH (FORCE)');}
 finally{await source.close();rmSync(local,{force:true,recursive:true});}
}
