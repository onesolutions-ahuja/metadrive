import {createHash} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {SqlPersistence} from './sql-persistence.js';

/** Versioned, additive SQL system migrations; existing business records are untouched. */
export async function applySystemMigrations(db:SqlPersistence) {
 const folder=fileURLToPath(new URL('./migrations/',import.meta.url));
 const files=readdirSync(folder).filter(name=>/^\d{8}-[a-z0-9-]+\.sql$/.test(name)).sort();
 await db.transaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['metadrive:system:migrations']);
  await client.query(`CREATE TABLE IF NOT EXISTS md_system_migrations (
   version text PRIMARY KEY,
   checksum text NOT NULL,
   applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  for(const name of files){
   const source=readFileSync(new URL('./migrations/'+name,import.meta.url),'utf8');
   const checksum=createHash('sha256').update(source).digest('hex');
   const existing=await client.query<{checksum:string}>(
    'SELECT checksum FROM md_system_migrations WHERE version=$1',[name]);
   if(existing.rows[0]) {
    if(existing.rows[0].checksum!==checksum)
     throw new Error('SQL system migration changed after application: '+name);
    continue;
   }
   await client.query(source);
   await client.query('INSERT INTO md_system_migrations(version,checksum) VALUES($1,$2)',[name,checksum]);
  }
 });
}
