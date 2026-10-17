import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { SqlPersistence } from './sql-persistence.js';
const scrypt = promisify(scryptCallback);
export class AuthenticationService {
  constructor(private readonly db: SqlPersistence) {}
  async hashPassword(password: string) {
    if (password.length < 12) throw new Error('Minimum password length is 12');
    const salt = randomBytes(16).toString('hex');
    const digest = await scrypt(password, salt, 64) as Buffer;
    return `scrypt:${salt}:${digest.toString('hex')}`;
  }
  async verifyPassword(password: string, encoded: string) {
    const [method,salt,hash] = encoded.split(':');
    if (method !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/i.test(hash ?? '')) return false;
    const digest = await scrypt(password,salt,64) as Buffer;
    return timingSafeEqual(digest,Buffer.from(hash,'hex'));
  }
  async signIn(tenantId: string,email: string,password: string,ttlSeconds=3600) {
    const { rows } = await this.db.query<{id:string,password_hash:string,enabled:boolean}>(
      'SELECT id,password_hash,enabled FROM md_users WHERE tenant_id=$1 AND lower(email)=lower($2)',[tenantId,email]);
    const user=rows[0];
    if (!user?.enabled || !(await this.verifyPassword(password,user.password_hash))) throw new Error('Invalid credentials');
    const token=randomBytes(32).toString('base64url');
    const digest=createHash('sha256').update(token).digest('hex');
    await this.db.query('INSERT INTO md_sessions (tenant_id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now()+($4 * interval \'1 second\'))',
      [tenantId,user.id,digest,ttlSeconds]);
    return { accessToken:token,expiresIn:ttlSeconds };
  }
  async authenticate(token: string) {
    const digest=createHash('sha256').update(token).digest('hex');
    const {rows}=await this.db.query<{tenant_id:string,user_id:string}>(
      'SELECT tenant_id,user_id FROM md_sessions WHERE token_hash=$1 AND expires_at>now() AND revoked_at IS NULL',[digest]);
    if (!rows[0]) throw new Error('Invalid session'); return rows[0];
  }
  async signOut(token:string) {
    await this.db.query('UPDATE md_sessions SET revoked_at=now() WHERE token_hash=$1',
      [createHash('sha256').update(token).digest('hex')]);
  }
}
