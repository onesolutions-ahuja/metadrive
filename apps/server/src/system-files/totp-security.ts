import {createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function totpKey():Buffer{
 const raw=process.env.METADRIVE_MFA_ENCRYPTION_KEY;
 if(!raw)throw Error('MFA encryption is not configured');
 const key=Buffer.from(raw,'base64');
 if(key.length!==32)throw Error('Invalid MFA encryption key');
 return key;
}
export function base32Encode(data:Buffer):string{
 let bits=0,value=0,result='';
 for(const byte of data){
  value=(value<<8)|byte;bits+=8;
  while(bits>=5){result+=alphabet[(value>>(bits-=5))&31];}
 }
 if(bits)result+=alphabet[(value<<(5-bits))&31];
 return result;
}
export function base32Decode(text:string):Buffer{
 if(!/^[A-Z2-7]{16,128}$/.test(text))throw Error('Invalid TOTP secret');
 let value=0,bits=0;const bytes:number[]=[];
 for(const ch of text){
  value=(value<<5)|alphabet.indexOf(ch);bits+=5;
  if(bits>=8){bytes.push((value>>(bits-=8))&255);value&=(1<<bits)-1;}
 }
 return Buffer.from(bytes);
}
export function encryptTotp(secret:string):Buffer{
 const key=totpKey(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 return Buffer.concat([iv,cipher.update(secret,'utf8'),cipher.final(),cipher.getAuthTag()]);
}
export function decryptTotp(encoded:Buffer):string{
 if(encoded.length<29)throw Error('Invalid MFA secret');
 const key=totpKey(),iv=encoded.subarray(0,12),tag=encoded.subarray(encoded.length-16);
 const cipher=createDecipheriv('aes-256-gcm',key,iv);
 cipher.setAuthTag(tag);
 return Buffer.concat([cipher.update(encoded.subarray(12,encoded.length-16)),cipher.final()]).toString('utf8');
}
export function matchingTotpStep(secret:string,code:string,lastCounter=-1,now=Date.now()):number|null{
 if(!/^[0-9]{6}$/.test(code))return null;
 const key=base32Decode(secret),counter=Math.floor(now/30000);
 for(let step=counter-1;step<=counter+1;step++){
  if(step<=lastCounter||step<0)continue;
  const message=Buffer.alloc(8);message.writeBigUInt64BE(BigInt(step));
  const digest=createHmac('sha1',key).update(message).digest();
  const offset=digest[19]&15;
  const number=((digest[offset]&127)<<24)|(digest[offset+1]<<16)|(digest[offset+2]<<8)|digest[offset+3];
  const expected=Buffer.from(String(number%1000000).padStart(6,'0'));
  if(timingSafeEqual(expected,Buffer.from(code)))return step;
 }
 return null;
}
