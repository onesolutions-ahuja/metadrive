import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Policy={method:'OTP'|'LINK';defaultChannel:'email';allowedChannels:['email'];
 templates:{email:{subject:string;body:string}}};
const defaults:Policy={method:'OTP',defaultChannel:'email',allowedChannels:['email'],
 templates:{email:{subject:'{!Tenant.Name} — password recovery',
 body:'Your verification code is {!Verification.Value}. Expires in {!Verification.ExpiryMinutes} minutes.'}}};
export class PasswordRecoverySettingsService{
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine){}
 async read(tenantId:string,userId:string){
  await this.rbac.require(tenantId,userId,'Security','read');
  const {rows}=await this.db.query<{smtp_credential_id:string|null;from_email:string;policy:Policy}>(
   'SELECT smtp_credential_id,from_email,policy FROM md_password_recovery_settings WHERE tenant_id=$1',[tenantId]);
  return {smtpCredentialId:rows[0]?.smtp_credential_id??'',fromEmail:rows[0]?.from_email??'',
   policy:rows[0]?.policy??defaults,linkReady:Boolean(process.env.METADRIVE_PASSWORD_RESET_ORIGIN)};
 }
 async save(tenantId:string,userId:string,input:unknown){
  await this.rbac.require(tenantId,userId,'Security','manage');
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid recovery settings');
  const body=input as Record<string,unknown>;
  const id=body.smtpCredentialId,from=body.fromEmail,policy=body.policy;
  if(typeof id!=='string'||(id!==''&&!uuid.test(id))||typeof from!=='string'||from.length>254||
     (id!==''&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from))||
     (id===''&&from!==''))throw new Error('Invalid recovery sender');
  if(!policy||typeof policy!=='object'||Array.isArray(policy))throw new Error('Invalid recovery policy');
  const p=policy as Record<string,unknown>,templates=p.templates as Record<string,unknown>|undefined;
  const email=templates?.email as Record<string,unknown>|undefined;
  if(!['OTP','LINK'].includes(String(p.method))||p.defaultChannel!=='email'||
     !Array.isArray(p.allowedChannels)||p.allowedChannels.length!==1||p.allowedChannels[0]!=='email'||
     !email||typeof email.subject!=='string'||typeof email.body!=='string'||
     !email.subject.trim()||!email.body.trim()||email.subject.length>300||email.body.length>10000)
     throw new Error('Invalid recovery policy');
  if(id!==''){
   const found=await this.db.query(
    "SELECT id FROM md_named_credentials WHERE tenant_id=$1 AND id=$2 AND protocol='SMTP' AND enabled=true",
    [tenantId,id]);
   if(!found.rowCount)throw new Error('SMTP credential not found');
  }
  const normalized:Policy={method:p.method as 'OTP'|'LINK',defaultChannel:'email',
   allowedChannels:['email'],templates:{email:{subject:email.subject,body:email.body}}};
  await this.db.query(`
   INSERT INTO md_password_recovery_settings(tenant_id,smtp_credential_id,from_email,policy)
   VALUES($1,$2,$3,$4::jsonb)
   ON CONFLICT(tenant_id) DO UPDATE
   SET smtp_credential_id=EXCLUDED.smtp_credential_id,from_email=EXCLUDED.from_email,
       policy=EXCLUDED.policy,revision=md_password_recovery_settings.revision+1,updated_at=now()`,
   [tenantId,id||null,from,JSON.stringify(normalized)]);
  return this.read(tenantId,userId);
 }
}
