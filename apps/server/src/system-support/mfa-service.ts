import {createHash,randomBytes} from 'node:crypto';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import type {AuthenticationService} from '../system-files/authentication.js';
import {decryptMfaSecret,encryptMfaSecret,newTotpSecret,validateTotp} from './mfa-crypto.js';
type Actor={tenant_id:string;user_id:string};
type Mode='Off'|'Optional'|'Required';
type Pending={token_hash:string;tenant_id:string;user_id:string;purpose:string;
 enrollment_required:boolean;secret_encrypted:Buffer|null;key_id:string|null;expires_at:Date;attempts:number};
type Credential={secret_encrypted:Buffer;key_id:string;last_counter:string};
const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
export class MfaService {
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine,private readonly auth:AuthenticationService){}
 async mode(tenantId:string):Promise<Mode>{
  const {rows}=await this.db.query<{mode:Mode}>('SELECT mode FROM md_tenant_mfa_policies WHERE tenant_id=$1',[tenantId]);
  return rows[0]?.mode??'Off';
 }
 async status(actor:Actor){
  const [mode,enrollment]=await Promise.all([this.mode(actor.tenant_id),this.db.query(
   'SELECT 1 FROM md_user_mfa WHERE tenant_id=$1 AND user_id=$2',[actor.tenant_id,actor.user_id])]);
  return {mode,enrolled:(enrollment.rowCount??0)>0};
 }
 async getPolicy(actor:Actor){
  await this.rbac.require(actor.tenant_id,actor.user_id,'Security','manage');
  return {mode:await this.mode(actor.tenant_id)};
 }
 async setPolicy(actor:Actor,proposal:unknown){
  await this.rbac.require(actor.tenant_id,actor.user_id,'Security','manage');
  const mode=(proposal as {mode?:unknown}|null)?.mode;
  if(!['Off','Optional','Required'].includes(String(mode)))throw new Error('Invalid MFA policy');
  if(mode!=='Off')encryptMfaSecret(newTotpSecret());
  await this.db.transaction(async client=>{
   await client.query(`
    INSERT INTO md_tenant_mfa_policies(tenant_id,mode) VALUES($1,$2)
    ON CONFLICT(tenant_id) DO UPDATE SET mode=EXCLUDED.mode,updated_at=now()`,[actor.tenant_id,mode]);
   await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND revoked_at IS NULL',[actor.tenant_id]);
   await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND revoked_at IS NULL',[actor.tenant_id]);
   await client.query("INSERT INTO md_security_events(tenant_id,actor_user_id,action,details) VALUES($1,$2,'mfa.policy',jsonb_build_object('mode',$3::text))",
    [actor.tenant_id,actor.user_id,mode]);
  });
  return {mode};
 }
 private async credential(tenant:string,user:string){
  const {rows}=await this.db.query<Credential>(
    'SELECT secret_encrypted,key_id,last_counter::text AS last_counter FROM md_user_mfa WHERE tenant_id=$1 AND user_id=$2',
    [tenant,user]);
  return rows[0];
 }
 private async createChallenge(tenant:string,user:string,purpose:'login'|'enroll',
   enrollmentRequired:boolean,secret?:string){
  const value=token(),cipher=secret?encryptMfaSecret(secret):null;
  await this.db.query(`
   INSERT INTO md_mfa_challenges(token_hash,tenant_id,user_id,purpose,enrollment_required,
    secret_encrypted,key_id,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '5 minutes')`,
   [tokenHash(value),tenant,user,purpose,enrollmentRequired,cipher?.encrypted??null,cipher?.keyId??null]);
  return value;
 }
 async beginLogin(tenantId:string,email:string,password:string){
  const userId=await this.auth.verifyIdentity(tenantId,email,password);
  const mode=await this.mode(tenantId);
  const existing=await this.credential(tenantId,userId);
  if(mode==='Off'||(mode==='Optional'&&!existing))
   return {session:await this.auth.issueSession(tenantId,userId,false)};
  const enrolling=!existing;
  const secret=enrolling?newTotpSecret():undefined;
  const challenge=await this.createChallenge(tenantId,userId,'login',enrolling,secret);
  return {mfa_required:true,challenge_token:challenge,enrollment_required:enrolling,
   ...(secret?{setup_secret:secret}:{})};
 }
 async beginEnrollment(actor:Actor,password:unknown){
  if(typeof password!=='string'||!password)throw new Error('Invalid credentials');
  const verified=await this.auth.verifyUserPassword(actor.tenant_id,actor.user_id,password);
  if(!verified)throw new Error('Invalid credentials');
  const secret=newTotpSecret(),value=await this.createChallenge(actor.tenant_id,actor.user_id,'enroll',true,secret);
  return {enrollment_token:value,setup_secret:secret};
 }
 private async consumeChallenge(value:unknown,code:unknown,purpose:'login'|'enroll',actor?:Actor){
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{40,}$/.test(value))
   throw new Error('Invalid MFA challenge');
  // The attempts increment survives incorrect codes; no transaction rollback restores attempts.
  const {rows}=await this.db.query<Pending>(`
   UPDATE md_mfa_challenges SET attempts=attempts+1
   WHERE token_hash=$1 AND purpose=$2 AND attempts<5 AND expires_at>now()
   RETURNING token_hash,tenant_id,user_id,purpose,enrollment_required,
    secret_encrypted,key_id,expires_at,attempts`,[tokenHash(value),purpose]);
  const pending=rows[0];
  if(!pending||(actor&&(pending.tenant_id!==actor.tenant_id||pending.user_id!==actor.user_id)))
   throw new Error('Invalid MFA challenge');
  const current=pending.enrollment_required?null:await this.credential(pending.tenant_id,pending.user_id);
  const encrypted=pending.enrollment_required?pending.secret_encrypted:current?.secret_encrypted;
  const keyId=pending.enrollment_required?pending.key_id:current?.key_id;
  if(!encrypted||!keyId)throw new Error('Invalid MFA challenge');
  const secret=decryptMfaSecret(encrypted,keyId);
  const counter=validateTotp(secret,code,current?Number(current.last_counter):-1);
  if(counter===null)throw new Error('Invalid MFA code');
  await this.db.transaction(async client=>{
   const claim=await client.query<Pending>(`
    DELETE FROM md_mfa_challenges WHERE token_hash=$1 AND purpose=$2 AND attempts<=5
      AND expires_at>now() RETURNING *`,[tokenHash(value),purpose]);
   if(!claim.rowCount)throw new Error('Invalid MFA challenge');
   if(pending.enrollment_required){
    await client.query(`
     INSERT INTO md_user_mfa(tenant_id,user_id,secret_encrypted,key_id,last_counter)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(tenant_id,user_id) DO NOTHING`,
     [pending.tenant_id,pending.user_id,encrypted,keyId,counter]);
    const row=await client.query<{last_counter:string}>(
     'SELECT last_counter::text FROM md_user_mfa WHERE tenant_id=$1 AND user_id=$2',
     [pending.tenant_id,pending.user_id]);
    if(row.rows[0]?.last_counter!==String(counter))throw new Error('MFA enrollment conflict');
   }else{
    const updated=await client.query(`
     UPDATE md_user_mfa SET last_counter=$3
     WHERE tenant_id=$1 AND user_id=$2 AND last_counter<$3`,
     [pending.tenant_id,pending.user_id,counter]);
    if(!updated.rowCount)throw new Error('Invalid MFA code');
   }
  });
  return {tenantId:pending.tenant_id,userId:pending.user_id};
 }
 async finishEnrollment(actor:Actor,value:unknown,code:unknown){
  await this.consumeChallenge(value,code,'enroll',actor);
  return {enrolled:true};
 }
 async verifyLogin(value:unknown,code:unknown){
  const {tenantId,userId}=await this.consumeChallenge(value,code,'login');
  return this.auth.issueSession(tenantId,userId,true);
 }
 async disable(actor:Actor,password:unknown,code:unknown){
  if(typeof password!=='string'||!(await this.auth.verifyUserPassword(actor.tenant_id,actor.user_id,password)))
   throw new Error('Invalid credentials');
  const current=await this.credential(actor.tenant_id,actor.user_id);
  if(!current)throw new Error('MFA not enrolled');
  const counter=validateTotp(decryptMfaSecret(current.secret_encrypted,current.key_id),code,Number(current.last_counter));
  if(counter===null)throw new Error('Invalid MFA code');
  await this.db.transaction(async client=>{
   await client.query('DELETE FROM md_user_mfa WHERE tenant_id=$1 AND user_id=$2',[actor.tenant_id,actor.user_id]);
   await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2',[actor.tenant_id,actor.user_id]);
   await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2',[actor.tenant_id,actor.user_id]);
   await client.query("INSERT INTO md_security_events(tenant_id,actor_user_id,action) VALUES($1,$2,'mfa.disable')",
    [actor.tenant_id,actor.user_id]);
  });
  return {enrolled:false};
 }
}
