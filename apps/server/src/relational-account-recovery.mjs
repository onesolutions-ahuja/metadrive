// Controlled, transaction-safe reset for one MetaDrive relational account.
// Caller must stop every MetaDrive API writer before operating on the live DB.
import { readRelationalRows } from './relational-tables.mjs';
import { restoreState, stateDigest } from './relational-projection.mjs';

export async function resetRelationalAccount(client,{email,salt,hash,revokedAt=Date.now()/1000}) {
  if(typeof email!=='string'||!email.trim()||typeof salt!=='string'||!salt||typeof hash!=='string'||!hash)
    throw Error('A valid email, salt and hash are required');
  if(!Number.isFinite(revokedAt)) throw Error('Invalid token-revocation time');
  let started=false;
  try {
    await client.query('BEGIN');
    started=true;
    await client.query("SET LOCAL lock_timeout='10s'");
    const marker=await client.query('SELECT version,state_sha256 FROM metadrive_rel_runtime WHERE id=1 FOR UPDATE');
    const migration=await client.query('SELECT revision FROM metadrive_rel_migrations WHERE revision=1');
    if(marker.rowCount!==1||migration.rowCount!==1) throw Error('Relational migration marker is missing');
    const version=Number(marker.rows[0].version);
    if(!Number.isSafeInteger(version)||version<0) throw Error('Invalid runtime revision');
    const before=restoreState(await readRelationalRows(client));
    if(stateDigest(before)!==String(marker.rows[0].state_sha256).trim())
      throw Error('Relational data checksum mismatch; refusing reset');
    const lookup=await client.query('SELECT user_id,disabled FROM metadrive_rel_users WHERE lower(btrim(email))=$1 FOR UPDATE',[email.trim().toLowerCase()]);
    if(lookup.rowCount!==1||lookup.rows[0].disabled) throw Error('Exactly one enabled account must match');
    const userId=lookup.rows[0].user_id;
    // All previously issued access JWTs, not just refresh sessions, are now invalid.
    // Issuance seconds equal to the reset second are also blocked.
    const authRevokedBefore=Math.floor(revokedAt);
    await client.query(
      "UPDATE metadrive_rel_users SET password_salt=$1,password_hash=$2, extra=coalesce(extra,'{}'::jsonb) || jsonb_build_object('authRevokedBefore',$4::bigint) WHERE user_id=$3",
      [salt,hash,userId,authRevokedBefore]
    );
    const revoke=await client.query('UPDATE metadrive_rel_refresh_sessions SET revoked_at=$1 WHERE user_id=$2 AND revoked_at IS NULL',[revokedAt,userId]);
    const after=restoreState(await readRelationalRows(client));
    const digest=stateDigest(after);
    if(digest===String(marker.rows[0].state_sha256).trim()) throw Error('Password hash did not change');
    await client.query('UPDATE metadrive_rel_runtime SET version=version+1,state_sha256=$1,updated_at=now() WHERE id=1',[digest]);
    await client.query('COMMIT');
    started=false;
    return {userId,revokedSessions:revoke.rowCount??0,version:version+1};
  } catch(error) {
    if(started) await client.query('ROLLBACK');
    throw error;
  }
}
