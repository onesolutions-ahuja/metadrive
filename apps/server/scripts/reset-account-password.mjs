// Run only while the MetaDrive API is STOPPED, to avoid stale state overwrites.
// DATABASE_URL and ACCOUNT_EMAIL are required. Password is entered interactively.
// Example: cd apps/server && node scripts/reset-account-password.mjs
import pg from 'pg';
import { randomBytes, scrypt as callback } from 'node:crypto';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
const scrypt = promisify(callback);
const email = process.env.ACCOUNT_EMAIL?.trim().toLowerCase();
if (!email || !process.env.DATABASE_URL) throw Error('Set ACCOUNT_EMAIL and DATABASE_URL');
if (!process.stdin.isTTY) throw Error('Interactive terminal required');
const rl = createInterface({input:process.stdin,output:process.stdout,terminal:true});
const password = await new Promise(resolve => {
  const write = rl._writeToOutput.bind(rl);
  let hide = true;
  rl._writeToOutput = s => write(hide && s.trim() ? '*' : s);
  rl.question('New password (12-256 chars): ', value => {hide=false;resolve(value);});
});
rl.close();
if (password.length < 12 || password.length > 256) throw Error('Invalid password length');
const salt = randomBytes(16).toString('hex');
const hash = (await scrypt(password,salt,64)).toString('hex');
const url = new URL(process.env.DATABASE_URL);
for(const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
const client = new pg.Client({connectionString:url.toString(),ssl:process.env.PGSSLMODE==='disable'?false:{
  rejectUnauthorized:process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT!=='true',
  ...(process.env.METADRIVE_DB_CA_CERT?{ca:process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g,'\n')}:{})
}});
await client.connect();
try {
  await client.query('BEGIN');
  const result=await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1 FOR UPDATE');
  if(result.rowCount!==1) throw Error('Platform state missing');
  const state=result.rows[0].payload;
  const users=state.users?.filter(u=>u.email?.trim().toLowerCase()===email);
  if(users?.length!==1 || users[0].disabled) throw Error('Exactly one enabled account must match');
  // Aiven backup from the earlier recovery attempt must exist before any write.
  const backup=await client.query("SELECT to_regclass('metadrive_password_reset_backup_20261010') AS name");
  if(!backup.rows[0].name) throw Error('Expected backup table is missing');
  users[0].passwordSalt=salt;
  users[0].passwordHash=hash;
  const now=Date.now()/1000;
  state.refreshSessions=(state.refreshSessions??[]).map(s=>s.userId===users[0].id?{...s,revokedAt:now}:s);
  await client.query('UPDATE metadrive_platform_state SET payload=$1::jsonb,updated_at=now() WHERE id=1',[JSON.stringify(state)]);
  await client.query('COMMIT');
  console.log('Password updated. Restart the stopped MetaDrive API before login.');
} catch(e) {await client.query('ROLLBACK');throw e;} finally {await client.end();}
