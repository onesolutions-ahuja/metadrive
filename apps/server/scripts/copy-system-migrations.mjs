import {cpSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url);
const input=fileURLToPath(new URL('../src/system-files/migrations/',root));
const output=fileURLToPath(new URL('../dist-system/system-files/migrations/',root));
mkdirSync(output,{recursive:true});
cpSync(input,output,{recursive:true,force:true});
