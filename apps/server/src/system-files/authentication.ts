import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { SqlPersistence } from './sql-persistence.js';
import {decryptTotp,matchingTotpStep,totpKey} from './totp-security.js';
const scrypt = promisify(scryptCallback);
const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex');
const mintToken = () => randomBytes(32).toString('base64url');
const ACCESS_SECONDS = 3600;
const REFRESH_SECONDS = 30 * 24 * 3600;
export class AuthenticationService {
  constructor(private readonly db:SqlPersistence) {}
  async hashPassword(password:string) {
    if (password.length < 12) throw new Error('Minimum password length is 12');
    const salt=randomBytes(16).toString('hex');
    const digest=await scrypt(password,salt,64) as Buffer;
    return `scrypt:${salt}:${digest.toString('hex')}`;
  }
  async verifyPassword(password:string,encoded:string) {
    const [method,salt,hash]=encoded.split(':');
    if(method!=='scrypt'|| !salt || !/^[a-f0-9]{128}$/i.test(hash??'')) return false;
    const digest=await scrypt(password,salt,64) as Buffer;
    return timingSafeEqual(digest,Buffer.from(hash,'hex'));
  }
  private async issue(tenantId:string,userId:string) {
    const access=mintToken(),refresh=mintToken();
    await this.db.transaction(async client=>{
      await client.query('INSERT INTO md_sessions (tenant_id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now()+($4 * interval \'1 second\'))',
        [tenantId,userId,fingerprint(access),ACCESS_SECONDS]);
      await client.query('INSERT INTO md_refresh_sessions (tenant_id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now()+($4 * interval \'1 second\'))',
        [tenantId,userId,fingerprint(refresh),REFRESH_SECONDS]);
    });
    return {accessToken:access,refreshToken:refresh,expiresIn:ACCESS_SECONDS};
  }
  async signIn(tenantId:string,email:string,password:string) {
    const {rows}=await this.db.query<{id:string,password_hash:string,enabled:boolean}>(
      'SELECT id,password_hash,enabled FROM md_users WHERE tenant_id=$1 AND lower(email)=lower($2)',[tenantId,email]);
    const user=rows[0];
    if(!user?.enabled || !(await this.verifyPassword(password,user.password_hash))) throw new Error('Invalid credentials');
    const {rows:security}=await this.db.query<{mode:string;secret_ciphertext:Buffer|null}>(
     `SELECT COALESCE(p.mode,'Disabled') AS mode,t.secret_ciphertext
      FROM md_users u LEFT JOIN md_tenant_mfa_policy p ON p.tenant_id=u.tenant_id
      LEFT JOIN md_user_totp t ON t.tenant_id=u.tenant_id AND t.user_id=u.id AND t.pending=false
      WHERE u.tenant_id=$1 AND u.id=$2`,[tenantId,user.id]);
    const mode=security[0]?.mode??'Disabled';
    if(mode==='Required'&&!security[0]?.secret_ciphertext)throw Error('MFA enrollment required');
    if(mode!=='Disabled'&&security[0]?.secret_ciphertext){
      // Never mint a session until the challenge is verified.
      totpKey();
      const challenge=mintToken();
      await this.db.transaction(async client=>{
        await client.query('DELETE FROM md_mfa_login_challenges WHERE tenant_id=$1 AND user_id=$2',[tenantId,user.id]);
        await client.query(`INSERT INTO md_mfa_login_challenges(token_hash,tenant_id,user_id,expires_at)
         VALUES($1,$2,$3,now()+interval '5 minutes')`,
         [fingerprint(challenge),tenantId,user.id]);
      });
      return {mfa_required:true as const,challenge_token:challenge};
    }
    return this.issue(tenantId,user.id);
  }
  async verifyMfaChallenge(token:string,code:string) {
    if(!/^[a-zA-Z0-9_-]{35,}$/.test(token)||!/^[0-9]{6}$/.test(code))
      throw Error('Invalid MFA challenge');
    const identity=await this.db.transaction(async client=>{
      const {rows}=await client.query<{
        tenant_id:string;user_id:string;attempts:number;secret_ciphertext:Buffer;last_counter:string
      }>(`SELECT c.tenant_id,c.user_id,c.attempts,t.secret_ciphertext,t.last_counter::text
          FROM md_mfa_login_challenges c JOIN md_user_totp t
            ON t.tenant_id=c.tenant_id AND t.user_id=c.user_id AND t.pending=false
          JOIN md_users u ON u.tenant_id=c.tenant_id AND u.id=c.user_id AND u.enabled=true
          WHERE c.token_hash=$1 AND c.expires_at>now() AND c.attempts<5
          FOR UPDATE OF c,t`,[fingerprint(token)]);
      const item=rows[0];
      if(!item)return null;
      await client.query('UPDATE md_mfa_login_challenges SET attempts=attempts+1 WHERE token_hash=$1',[fingerprint(token)]);
      const step=matchingTotpStep(decryptTotp(item.secret_ciphertext),code,Number(item.last_counter));
      if(step===null)return null;
      await client.query('UPDATE md_user_totp SET last_counter=$3 WHERE tenant_id=$1 AND user_id=$2',
        [item.tenant_id,item.user_id,step]);
      await client.query('DELETE FROM md_mfa_login_challenges WHERE token_hash=$1',[fingerprint(token)]);
      return {tenantId:item.tenant_id,userId:item.user_id};
    });
    if(!identity)throw Error('Invalid MFA code');
    return this.issue(identity.tenantId,identity.userId);
  }
  async refresh(token:string) {
    if(!/^[a-zA-Z0-9_-]{35,}$/.test(token)) throw new Error('Invalid session');
    const nextAccess=mintToken(),nextRefresh=mintToken();
    const identity=await this.db.transaction(async client=>{
      const old=await client.query<{tenant_id:string,user_id:string}>(
        'UPDATE md_refresh_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() RETURNING tenant_id,user_id',
        [fingerprint(token)]);
      if(!old.rows[0]) throw new Error('Invalid session');
      const {tenant_id,user_id}=old.rows[0];
      const enabled=await client.query('SELECT id FROM md_users WHERE id=$1 AND tenant_id=$2 AND enabled=true',[user_id,tenant_id]);
      if(!enabled.rowCount) throw new Error('Invalid session');
      await client.query('INSERT INTO md_sessions (tenant_id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now()+($4 * interval \'1 second\'))',
        [tenant_id,user_id,fingerprint(nextAccess),ACCESS_SECONDS]);
      await client.query('INSERT INTO md_refresh_sessions (tenant_id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now()+($4 * interval \'1 second\'))',
        [tenant_id,user_id,fingerprint(nextRefresh),REFRESH_SECONDS]);
      return {tenant_id,user_id};
    });
    return { ...identity,accessToken:nextAccess,refreshToken:nextRefresh,expiresIn:ACCESS_SECONDS };
  }
  async authenticate(token:string) {
    const {rows}=await this.db.query<{tenant_id:string,user_id:string}>(
      'SELECT s.tenant_id,s.user_id FROM md_sessions s JOIN md_users u ON u.id=s.user_id AND u.tenant_id=s.tenant_id AND u.enabled=true WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL',
      [fingerprint(token)]);
    if(!rows[0]) throw new Error('Invalid session');
    return rows[0];
  }
  async signOut(token:string,refreshToken?:string) {
    await this.db.query('UPDATE md_sessions SET revoked_at=now() WHERE token_hash=$1',[fingerprint(token)]);
    if(refreshToken) await this.db.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE token_hash=$1',[fingerprint(refreshToken)]);
  }
}
