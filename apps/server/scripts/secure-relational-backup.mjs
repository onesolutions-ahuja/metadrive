// AES-256-GCM authenticated encryption for a PostgreSQL backup artifact.
// Never log secrets or store unencrypted customer data in GitHub artifacts.
import { randomBytes,scryptSync,createCipheriv,createDecipheriv } from 'node:crypto';
import { createReadStream,createWriteStream } from 'node:fs';
import { open,stat,writeFile,appendFile,rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

const [action,input,output]=process.argv.slice(2);
if(!['encrypt','decrypt'].includes(action)||!input||!output||process.argv.length!==5)
  throw Error('Usage: secure-relational-backup.mjs encrypt|decrypt INPUT OUTPUT');
const secret=process.env.METADRIVE_BACKUP_ENCRYPTION_KEY;
if(!secret||secret.length<48) throw Error('A distinct 48+ character backup encryption key is required');
const magic=Buffer.from('MDAVBK01');
const headerLength=36;
try {
  if(action==='encrypt') {
    const salt=randomBytes(16),iv=randomBytes(12);
    const cipher=createCipheriv('aes-256-gcm',scryptSync(secret,salt,32),iv);
    await writeFile(output,Buffer.concat([magic,salt,iv]),{mode:0o600,flag:'wx'});
    await pipeline(createReadStream(input),cipher,createWriteStream(output,{flags:'a'}));
    await appendFile(output,cipher.getAuthTag());
  } else {
    const info=await stat(input);
    if(info.size<=headerLength+16) throw Error('Encrypted backup is incomplete');
    const handle=await open(input,'r');
    const header=Buffer.alloc(headerLength),tag=Buffer.alloc(16);
    try {await handle.read(header,0,headerLength,0);await handle.read(tag,0,16,info.size-16);}
    finally {await handle.close();}
    if(!header.subarray(0,8).equals(magic)) throw Error('Encrypted backup format mismatch');
    const decipher=createDecipheriv('aes-256-gcm',scryptSync(secret,header.subarray(8,24),32),header.subarray(24,36));
    decipher.setAuthTag(tag);
    await pipeline(createReadStream(input,{start:headerLength,end:info.size-17}),decipher,
      createWriteStream(output,{flags:'wx',mode:0o600}));
  }
  console.log('Backup cryptographic integrity check completed');
} catch(error) { await rm(output,{force:true}); throw error; }
