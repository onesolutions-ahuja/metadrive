import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
type Secret={keyId:string;key:Buffer};
const validId=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
function fromBase64(input:string):Buffer {
 const decoded=Buffer.from(input,'base64');
 if(decoded.length!==32||decoded.toString('base64').replace(/=+$/,'')!==input.replace(/=+$/,''))throw Error('Invalid credential key');
 return decoded;
}
export function credentialKeyring():Map<string,Buffer>{
 const result=new Map<string,Buffer>();
 const legacy=process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY;
 if(legacy)result.set('legacy',fromBase64(legacy));
 const source=process.env.METADRIVE_CREDENTIAL_KEYS;
 if(source){
  let parsed:unknown;
  try{parsed=JSON.parse(source);}catch{throw Error('Invalid credential keyring configuration');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Invalid credential keyring configuration');
  for(const [id,value] of Object.entries(parsed)){
   if(!validId.test(id)||id==='legacy'||typeof value!=='string')throw Error('Invalid credential key identity');
   result.set(id,fromBase64(value));
  }
 }
 return result;
}
export function activeCredentialKey():Secret{
 const keys=credentialKeyring();
 const id=process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID??
  (keys.has('legacy')?'legacy':undefined);
 if(!id||!validId.test(id)||!keys.has(id))throw Error('Active credential encryption key unavailable');
 return {keyId:id,key:keys.get(id)!};
}
export function encryptCredential(plain:string):{ciphertext:Buffer;keyId:string}{
 const {keyId,key}=activeCredentialKey(),iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([iv,cipher.update(plain,'utf8'),cipher.final(),cipher.getAuthTag()]);
 return {ciphertext,keyId};
}
export function decryptCredential(ciphertext:Buffer,keyId:string):string{
 const key=credentialKeyring().get(keyId);
 if(!key||ciphertext.length<29)throw Error('Credential decryption key unavailable');
 const iv=ciphertext.subarray(0,12),tag=ciphertext.subarray(ciphertext.length-16);
 const decipher=createDecipheriv('aes-256-gcm',key,iv);
 decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(ciphertext.subarray(12,-16)),decipher.final()]).toString('utf8');
}
