// Offline-only relational account recovery; requires a verified restorable backup.
// Password never appears in a CLI argument, environment variable, log or Git history.
// Use only AFTER the relational cutover and with every API writer stopped.
import pg from 'pg';
import { scrypt as callback, randomBytes, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { createReadStream, statSync } from 'node:fs';
import { resetRelationalAccount } from '../src/relational-account-recovery.mjs';
const scrypt=promisify(callback);
if(process.argv.length!==3||process.argv[2]!=='--apply') throw Error('Only --apply is supported; no accidental writes');
if(process.env.METADRIVE_PERSISTENCE_MODE!=='relational') throw Error('Relational runtime flag must be enabled');
if(process.env.METADRIVE_CONFIRMED_OFFLINE!=='true') throw Error('All MetaDrive API instances must be stopped and confirmed offline');
if(process.env.METADRIVE_BACKUP_VERIFIED_RESTORE!=='true') throw Error('A backup restore must be verified before account recovery');
const email=process.env.ACCOUNT_EMAIL?.trim().toLowerCase();
const urlString=process.env.DATABASE_URL;
const backup=process.env.METADRIVE_VERIFIED_BACKUP_FILE;
const expectedBackupHash=process.env.METADRIVE_VERIFIED_BACKUP_SHA256;
if(!email||!urlString||!backup||!expectedBackupHash||!/^[0-9a-f]{64}$/i.test(expectedBackupHash))
  throw Error('ACCOUNT_EMAIL, DATABASE_URL and a verified backup path + SHA256 are required');
if(!process.stdin.isTTY) throw Error('Interactive terminal required for confidential password input');
const backupStat=statSync(backup);
if(!backupStat.isFile()||backupStat.size===0) throw Error('Backup is missing or empty');
const sha=createHash('sha256');
for await (const chunk of createReadStream(backup)) sha.update(chunk);
if(sha.digest('hex')!==expectedBackupHash.toLowerCase()) throw Error('Verified backup SHA256 mismatch: no changes made');

const rl=createInterface({input:process.stdin,output:process.stdout,terminal:true});
const password=await new Promise(resolve=>{
  const original=rl._writeToOutput.bind(rl);
  let hidden=true;
  rl._writeToOutput=s=>original(hidden&&s.trim()?'*':s);
  rl.question('New password (12-256 chars): ',value=>{hidden=false;resolve(value);});
});
rl.close();
if(typeof password!=='string'||password.length<12||password.length>256) throw Error('Password length must be 12-256 characters');
const salt=randomBytes(16).toString('hex');
const hash=(await scrypt(password,salt,64)).toString('hex');
const u=new URL(urlString);
for(const key of ['sslmode','sslcert','sslkey','sslrootcert']) u.searchParams.delete(key);
const client=new pg.Client({
  connectionString:u.toString(),
  ssl:process.env.PGSSLMODE==='disable'?false:{
    rejectUnauthorized:process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT!=='true',
    ...(process.env.METADRIVE_DB_CA_CERT?{ca:process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g,'\n')}:{})
  }
});
await client.connect();
try {
  const result=await resetRelationalAccount(client,{email,salt,hash});
  console.log('Account password updated; prior refresh sessions revoked: '+result.revokedSessions);
  console.log('Restart a single MetaDrive API instance and verify login before scaling out.');
} finally {await client.end();}
