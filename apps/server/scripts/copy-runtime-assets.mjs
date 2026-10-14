// tsc does not emit source .mjs modules; production index.js imports them.
// Copy the exact audited runtime dependencies into the compiled server output.
import { copyFileSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=resolve(serverDir,'dist');
mkdirSync(destination,{recursive:true});
for(const name of [
  'platform-state-registry.mjs',
  'platform-state-restore.mjs',
  'platform-state-project.mjs',
  'relational-projection.mjs',
  'relational-tables.mjs',
  'relational-runtime.mjs',
  'relational-copy.mjs',
  'relational-account-recovery.mjs',
  'normalized-state-tree.mjs',
  'normalized-state-runtime.mjs',
  'normalized-state-delta.mjs',
  'normalized-object-schema.mjs',
  'normalized-typed-records.mjs',
  'tenant-identity-isolation.mjs',
  'tenant-domains.mjs',
  'tenant-recovery-policy.mjs',
  'tenant-recovery-cases.mjs',
  'tenant-recovery-verification.mjs',
  'tenant-recovery-transaction.mjs',
  'tenant-recovery-centre.mjs',
  'tenant-recovery-readiness.mjs',
  'advanced-sharing-policy.mjs',
  'component-scope.mjs',
  'route-aliases.mjs',
  'flow-formula-syntax.mjs',
  'flow-record-metadata.mjs',
  'flow-create-collection.mjs',
  'flow-collection-assignment.mjs',
  'tenant-usage.mjs',
  'package-page-migrations.mjs',
  'installable-app-packages.mjs',
  'bundled-app-components.mjs',
  'bundled-component-migration.mjs'
]) {
  copyFileSync(resolve(serverDir,'src',name),resolve(destination,name));
}
// Shared metadata services used by the compiled server's protected registry.
for(const name of ['offline-publication.mjs','offline-publication-route.mjs','component-revisions.mjs']){
 const relativePath='modules/metadata/'+name;
 const target=resolve(destination,relativePath);
 mkdirSync(dirname(target),{recursive:true});
 copyFileSync(resolve(serverDir,'src',relativePath),target);
}
// Catch missing runtime imports in the production build itself, not in Render.
// TypeScript deliberately leaves .mjs specifiers untouched, and tsc does not
// copy these files. Scan every emitted module, including nested JS outputs.
const pending=[destination];
while(pending.length) {
  const directory=pending.pop();
  for(const name of readdirSync(directory)) {
    const file=resolve(directory,name);
    if(statSync(file).isDirectory()) {pending.push(file);continue;}
    if(!/\.(?:js|mjs)$/.test(name)) continue;
    const source=readFileSync(file,'utf8');
    const imports=[...source.matchAll(/\b(?:from\s*|import\s*\(\s*)['"]([^'"]+\.mjs)['"]/g)];
    for(const match of imports) {
      if (!match[1].startsWith('.')) continue;
      if (!existsSync(resolve(dirname(file),match[1]))) {
        throw Error('Missing compiled .mjs dependency: '+match[1]+' from '+name);
      }
    }
  }
}
console.info('MetaDrive relational runtime modules copied to server dist');
