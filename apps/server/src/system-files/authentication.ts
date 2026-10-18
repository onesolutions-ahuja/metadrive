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
  async issueSession(tenantId:string,userId:string,mfaVerified=false) {
    const access=mintToken(),refresh=mintToken();
    await this.db.transaction(async client=>{
      const mfaGate=await client.query<{mode:string}>(
        'SELECT mode FROM md_tenant_mfa_policies WHERE tenant_id=$1',[tenantId]);
      const enrolled=await client.query('SELECT 1 FROM md_user_mfa WHERE tenant_id=$1 AND user_id=$2',[tenantId,userId]);
      if((mfaGate.rows[0]?.mode==='Required'||(mfaGate.rows[0]?.mode==='Optional'&&enrolled.rowCount))&&!mfa_verified)
        throw new Error('Invalid session');
      await client.query('INSERT INTO md_sessions (tenant_id,user_id,token_hash,expires_at,mfa_verified) VALUES ($1,$2,$3,now()+($4 * interval \'1 second\'),$5)',
        [tenantId,userId,fingerprint(access),ACCESS_SECONDS,mfaVerified]);
      await client.query('INSERT INTO md_refresh_sessions (tenant_id,user_id,token_hash,expires_at,mfa_verified) VALUES ($1,$2,$3,now()+($4 * interval \'1 second\'),$5)',
        [tenantId,userId,fingerprint(refresh),REFRESH_SECONDS,mfaVerified]);
    });
    return {accessToken:access,refreshToken:refresh,expiresIn:ACCESS_SECONDS};
  }
  async verifyUserPassword(tenantId:string,userId:string,password:string){
    const {rows}=await this.db.query<{password_hash:string}>(
      "SELECT password_hash FROM md_users WHERE tenant_id=$1 AND id=$2 AND enabled=true AND (locked_until IS NULL OR locked_until<=now())",
      [tenantId,userId]);
    return Boolean(rows[0]&&await this.verifyPassword(password,rows[0].password_hash));
  }
  async verifyIdentity(tenantId:string,email:string,password:string){
    const {rows}=await this.db.query<{id:string,password_hash:string,enabled:boolean;locked_until:Date|null}>(
      "SELECT id,password_hash,enabled,locked_until FROM md_users WHERE tenant_id=$1 AND lower(email)=lower($2) AND EXISTS (SELECT 1 FROM md_tenants t WHERE t.id=md_users.tenant_id AND t.status='ACTIVE')",
      [tenantId,email]);
    const user=rows[0];
    if(!user?.enabled||(user.locked_until&&new Date(user.locked_until).getTime()>Date.now())||
       !(await this.verifyPassword(password,user.password_hash)))throw new Error('Invalid credentials');
    return user.id;
  }
  async signIn(tenantId:string,email:string,password:string) {
    const id=await this.verifyIdentity(tenantId,email,password);
    const mode=await this.db.query<{mode:string}>('SELECT mode FROM md_tenant_mfa_policies WHERE tenant_id=$1',[tenantId]);
    const enrolled=await this.db.query('SELECT 1 FROM md_user_mfa WHERE tenant_id=$1 AND user_id=$2',[tenantId,id]);
    if(mode.rows[0]?.mode==='Required'||(mode.rows[0]?.mode==='Optional'&&enrolled.rowCount))
      throw new Error('MFA verification required');
    return this.issueSession(tenantId,id,false);
  }
  async refresh(token:string) {
    if(!/^[a-zA-Z0-9_-]{35,}$/.test(token)) throw new Error('Invalid session');
    const nextAccess=mintToken(),nextRefresh=mintToken();
    const identity=await this.db.transaction(async client=>{
      const old=await client.query<{tenant_id:string,user_id:string;mfa_verified:boolean}>(
        'UPDATE md_refresh_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() RETURNING tenant_id,user_id,mfa_verified',
        [fingerprint(token)]);
      if(!old.rows[0]) throw new Error('Invalid session');
      const {tenant_id,user_id,mfa_verified}=old.rows[0];
      const enabled=await client.query("SELECT id FROM md_users WHERE id=$1 AND tenant_id=$2 AND enabled=true AND (locked_until IS NULL OR locked_until<=now()) AND EXISTS (SELECT 1 FROM md_tenants t WHERE t.id=md_users.tenant_id AND t.status='ACTIVE')",[user_id,tenant_id]);
      if(!enabled.rowCount) throw new Error('Invalid session');
      const policy=await client.query<{mode:string}>('SELECT mode FROM md_tenant_mfa_policies WHERE tenant_id=$1',[tenant_id]);
      const enrolled=await client.query('SELECT 1 FROM md_user_mfa WHERE tenant_id=$1 AND user_id=$2',[tenant_id,user_id]);
      if((policy.rows[0]?.mode==='Required'||(policy.rows[0]?.mode==='Optional'&&enrolled.rowCount))&&!mfa_verified)
        throw new Error('Invalid session');
      await client.query('INSERT INTO md_sessions (tenant_id,user_id,token_hash,expires_at,mfa_verified) VALUES ($1,$2,$3,now()+($4 * interval \'1 second\'),$5)',
        [tenant_id,user_id,fingerprint(nextAccess),ACCESS_SECONDS,mfa_verified]);
      await client.query('INSERT INTO md_refresh_sessions (tenant_id,user_id,token_hash,expires_at,mfa_verified) VALUES ($1,$2,$3,now()+($4 * interval \'1 second\'),$5)',
        [tenant_id,user_id,fingerprint(nextRefresh),REFRESH_SECONDS,mfa_verified]);
      return {tenant_id,user_id};
    });
    return { ...identity,accessToken:nextAccess,refreshToken:nextRefresh,expiresIn:ACCESS_SECONDS };
  }
  async authenticate(token:string) {
    const {rows}=await this.db.query<{tenant_id:string,user_id:string}>(
      "SELECT s.tenant_id,s.user_id FROM md_sessions s JOIN md_users u ON u.id=s.user_id AND u.tenant_id=s.tenant_id AND u.enabled=true AND (u.locked_until IS NULL OR u.locked_until<=now()) JOIN md_tenants t ON t.id=s.tenant_id AND t.status='ACTIVE' WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND (NOT EXISTS (SELECT 1 FROM md_tenant_mfa_policies m WHERE m.tenant_id=s.tenant_id AND (m.mode='Required' OR (m.mode='Optional' AND EXISTS (SELECT 1 FROM md_user_mfa mf WHERE mf.tenant_id=s.tenant_id AND mf.user_id=s.user_id)))) OR s.mfa_verified=true)",
      [fingerprint(token)]);
    if(!rows[0]) throw new Error('Invalid session');
    return rows[0];
  }
  async activeSessions(tenantId:string,userId:string){
    const {rows}=await this.db.query<{id:string;expires_at:Date|string;mfa_verified:boolean}>(
      'SELECT id,expires_at,mfa_verified FROM md_refresh_sessions WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() ORDER BY expires_at DESC LIMIT 100',
      [tenantId,userId]);
    return {sessions:rows.map(row=>({
      familyId:row.id,
      expiresAt:Math.floor(new Date(row.expires_at).getTime()/1000),
      mfaVerified:row.mfa_verified===true
    }))};
  }
  async revokeAllSessions(tenantId:string,userId:string,password:string){
    if(!password)throw new Error('Invalid credentials');
    await this.db.transaction(async client=>{
      const result=await client.query<{password_hash:string}>(
        'SELECT password_hash FROM md_users WHERE tenant_id=$1 AND id=$2 AND enabled=true FOR UPDATE',
        [tenantId,userId]);
      if(!result.rows[0]||!(await this.verifyPassword(password,result.rows[0].password_hash)))
        throw new Error('Invalid credentials');
      await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[tenantId,userId]);
      await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[tenantId,userId]);
    });
  }
  async changePassword(tenantId:string,userId:string,currentPassword:string,newPassword:string){
    if(!currentPassword||!newPassword||newPassword===currentPassword)
      throw new Error('Invalid password change');
    const passwordHash=await this.hashPassword(newPassword);
    await this.db.transaction(async client=>{
      const result=await client.query<{password_hash:string}>(
        'SELECT password_hash FROM md_users WHERE tenant_id=$1 AND id=$2 AND enabled=true FOR UPDATE',
        [tenantId,userId]);
      if(!result.rows[0]||!(await this.verifyPassword(currentPassword,result.rows[0].password_hash)))
        throw new Error('Invalid credentials');
      await client.query('UPDATE md_users SET password_hash=$3 WHERE tenant_id=$1 AND id=$2',
        [tenantId,userId,passwordHash]);
      await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[tenantId,userId]);
      await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[tenantId,userId]);
    });
  }
  async signOut(token:string,refreshToken?:string) {
    await this.db.query('UPDATE md_sessions SET revoked_at=now() WHERE token_hash=$1',[fingerprint(token)]);
    if(refreshToken) await this.db.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE token_hash=$1',[fingerprint(refreshToken)]);
  }
}
