import {createCipheriv,randomBytes} from 'node:crypto';
import type {SqlPersistence} from '../system-files/sql-persistence.js';

/** Non-secret settings for Meta Cloud API. Secrets are never seeded. */
export const WHATSAPP_VARIABLES=Object.freeze({
 graphApiVersion:'',wabaId:'',phoneNumberId:'',businessPortfolioId:'',
 metaAppId:'',businessPhoneE164:'',templateLanguage:'en_US',
 webhookCallbackUrl:'',displayName:''
});

/**
 * Fill the blank WhatsApp Named Credential for explicitly installed AceChatter tenants.
 * Preserve all customer secrets, configuration values and existing credentials.
 * Skip encrypted defaults when the deployment has no configured encryption key.
 */
export async function seedWhatsAppNamedCredentialVariables(db:SqlPersistence):Promise<number>{
 const activeKeyId=process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID||'legacy';
 let base64:string|undefined;
 if(activeKeyId==='legacy')base64=process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY;
 else {
  try{
   const json=JSON.parse(process.env.METADRIVE_CREDENTIAL_KEYS||'{}') as Record<string,unknown>;
   if(typeof json[activeKeyId]==='string')base64=json[activeKeyId];
  }catch{/* encryption keys are not configured */}
 }
 const key=base64?Buffer.from(base64,'base64'):null;
 if(!key||key.length!==32)return 0;
 const {rows}=await db.query<{tenant_id:string}>(`
   SELECT c.tenant_id FROM md_named_credentials c
   JOIN md_app_installations i ON i.tenant_id=c.tenant_id
   JOIN md_apps a ON a.id=i.app_id AND a.api_name='AceChatter' AND a.enabled=true
   JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=i.tenant_id
     AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())
   WHERE c.name='WhatsApp_Cloud_API' AND c.configuration_ciphertext IS NULL`);
 let count=0;
 for(const {tenant_id} of rows){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const encoded=Buffer.concat([iv,cipher.update(JSON.stringify(WHATSAPP_VARIABLES),'utf8'),
   cipher.final(),cipher.getAuthTag()]);
  const result=await db.query(`UPDATE md_named_credentials
   SET configuration_ciphertext=$2,encryption_key_id=$3,updated_at=now()
   WHERE tenant_id=$1 AND name='WhatsApp_Cloud_API'
     AND configuration_ciphertext IS NULL AND secret_ciphertext IS NULL AND enabled=false`,
   [tenant_id,encoded,activeKeyId]);
  count+=result.rowCount??0;
 }
 return count;
}
