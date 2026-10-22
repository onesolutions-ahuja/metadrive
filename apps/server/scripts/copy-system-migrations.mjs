import {cpSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url);
const input=fileURLToPath(new URL('../src/system-support/migrations/',root));
const output=fileURLToPath(new URL('../dist-system/system-support/migrations/',root));
mkdirSync(output,{recursive:true});
cpSync(input,output,{recursive:true,force:true});
// Include independently owned connector scripts when running the compiled server.
const connectors=fileURLToPath(new URL('../../connectors/',root));
const outputConnectors=fileURLToPath(new URL('../dist-system/connector-scripts/',root));
mkdirSync(outputConnectors,{recursive:true});
cpSync(connectors,outputConnectors,{recursive:true,force:true});
