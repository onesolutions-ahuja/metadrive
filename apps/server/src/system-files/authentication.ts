import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { SqlPersistence } from './sql-persistence.js';
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
    return this.issue(tenantId,user.id);
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
