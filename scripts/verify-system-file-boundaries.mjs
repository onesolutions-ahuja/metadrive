import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('apps/server/src/system-files');
const files=fs.readdirSync(root,{withFileTypes:true});
const expected=['sql-persistence.ts','object-definition.ts','authentication.ts','rbac-engine.ts','record-engine.ts','component-runtime.ts','page-runtime.ts','flow-runtime.ts','app-runtime.ts','tenant-provisioning.ts','schema.sql','README.md','session-metadata.ts','platform-tenant-service.ts','system-definition-service.ts'];
const allowed=new Set(expected);
const forbidden=files.filter(f=>!f.isFile() || !allowed.has(f.name));
if(forbidden.length){
 console.error('System runtime contains misplaced test or script files:',forbidden.map(f=>f.name));
 process.exitCode=1;
}
const tests=fs.readdirSync('apps/server/test/system').filter(f=>f.endsWith('.test.ts'));
if(tests.length<6) {
 console.error('System regression tests missing from the dedicated test directory');
 process.exitCode=1;
}
const missing=expected.filter(name=>!fs.existsSync(path.join(root,name)));
if(missing.length){console.error('Mandatory core contract missing:',missing);process.exitCode=1;}
if(!process.exitCode)console.log('System file boundaries verified');

// Detect stale architectural references in current authoritative documentation.
for(const filename of ['docs/server-code-organisation.md','apps/server/src/system-files/README.md']) {
 const document=fs.readFileSync(filename,'utf8');
 if(document.includes('src/system-files/entrypoint.ts')||document.includes('12 foundational engines')){
  console.error('Outdated Core architecture reference:',filename);process.exitCode=1;
 }
}
