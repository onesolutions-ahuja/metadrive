// tsc does not emit source .mjs modules; production index.js imports them.
// Copy the exact audited runtime dependencies into the compiled server output.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=resolve(serverDir,'dist');
mkdirSync(destination,{recursive:true});
for(const name of [
  'relational-projection.mjs',
  'relational-tables.mjs',
  'relational-runtime.mjs',
  'relational-copy.mjs',
  'relational-account-recovery.mjs',
  'normalized-state-tree.mjs',
  'normalized-state-runtime.mjs',
  'normalized-object-schema.mjs',
  'normalized-typed-records.mjs'
]) {
  copyFileSync(resolve(serverDir,'src',name),resolve(destination,name));
}
console.info('MetaDrive relational runtime modules copied to server dist');
