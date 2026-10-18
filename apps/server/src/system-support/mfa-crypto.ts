import {createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
function keyFor(id?:string){
 const ring=process.env.METADRIVE_CREDENTIAL_KEYS;
 const current=process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID;
 if(ring||current){
  if(!ring||!current)throw new Error('Credential encryption is not configured');
  let parsed:unknown;try{parsed=JSON.parse(ring);}catch{throw new Error('Credential encryption is not configured');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Credential encryption is not configured');
  const raw=(parsed as Record<string,unknown>)[id??current];
  if(typeof raw!=='string')throw new Error('Credential encryption key unavailable');
  const buf=Buffer.from(raw,'base64');
  if(buf.length!==32)throw new Error('Credential encryption key unavailable');
  return {key:buf,id:id??current};
 }
 const raw=process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY;
 const key=raw?Buffer.from(raw,'base64'):Buffer.alloc(0);
 if(key.length!==32||(id!==undefined&&id!=='legacy'))throw new Error('Credential encryption is not configured');
 return {key,id:'legacy'};
}
export function encryptMfaSecret(secret:string){
 const {key,id}=keyFor(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 return {encrypted:Buffer.concat([iv,cipher.update(secret,'utf8'),cipher.final(),cipher.getAuthTag()]),keyId:id};
}
export function decryptMfaSecret(encrypted:Buffer,keyId:string){
 if(encrypted.length<29)throw new Error('Invalid encrypted credential');
 const {key}=keyFor(keyId);
 const decipher=createDecipheriv('aes-256-gcm',key,encrypted.subarray(0,12));
 decipher.setAuthTag(encrypted.subarray(encrypted.length-16));
 return Buffer.concat([decipher.update(encrypted.subarray(12,-16)),decipher.final()]).toString('utf8');
}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret(){
 const bytes=randomBytes(20);let value=0,bits=0,out='';
 for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(value>>>bits)&31];}}
 if(bits)out+=alphabet[(value<<(5-bits))&31];
 return out;
}
function bytesFromBase32(source:string){
 let bits=0,value=0;const bytes:number[]=[];
 for(const char of source){const index=alphabet.indexOf(char);if(index<0)throw new Error('Invalid authenticator secret');
  value=(value<<5)|index;bits+=5;
  if(bits>=8){bits-=8;bytes.push((value>>>bits)&255);}
 }
 return Buffer.from(bytes);
}
function codeAt(secret:string,counter:number){
 const buffer=Buffer.alloc(8);buffer.writeBigUInt64BE(BigInt(counter));
 const hash=createHmac('sha1',bytesFromBase32(secret)).update(buffer).digest();
 const offset=hash[hash.length-1]&15;
 return ((hash.readUInt32BE(offset)&0x7fffffff)%1_000_000).toString().padStart(6,'0');
}
export function validateTotp(secret:string,code:unknown,lastCounter=-1,now=Date.now()){
 if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;
 const current=Math.floor(now/30_000);
 for(let counter=current-1;counter<=current+1;counter++){
  if(counter<=lastCounter)continue;
  const expected=codeAt(secret,counter);
  if(timingSafeEqual(Buffer.from(code),Buffer.from(expected)))return counter;
 }
 return null;
}

/** Decrypt legacy Named Credential ciphertext using the provider-independent active key. */
export function decryptStoredCredential(ciphertext:Buffer) {
 const {key}=keyFor();
 if(ciphertext.length<29)throw new Error('Invalid encrypted credential');
 const decipher=createDecipheriv('aes-256-gcm',key,ciphertext.subarray(0,12));
 decipher.setAuthTag(ciphertext.subarray(-16));
 return Buffer.concat([decipher.update(ciphertext.subarray(12,-16)),decipher.final()]).toString('utf8');
}
export function secureRecoveryHash(value:string) {
 const {key}=keyFor();
 return createHmac('sha256',key).update(value).digest('hex');
}
