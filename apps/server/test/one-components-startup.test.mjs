import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppSeedCatalog } from '../src/seeders/catalog.mjs';
import { ensureBundledAppComponents } from '../src/bundled-app-components.mjs';

const dir=resolve(fileURLToPath(new URL('..',import.meta.url)));
const manifestRoot=resolve(dir,'../web/src/custom-components');
const catalog=loadAppSeedCatalog();
test('Core bundles reconcile with existing 39 entries without dropping tenant definitions',()=>{
 const recovered=Array.from({length:39},(_,i)=>({apiName:'RecoveredShared'+i,status:'Published',trustedBundled:true,version:1}));
 const tenantOwned={apiName:'CustomerOwnedComponent',tenantId:'tenant-1',trustedBundled:false,version:3};
 const inputs=[...recovered,tenantOwned];
 const first=ensureBundledAppComponents(inputs, {records:{}}, catalog,manifestRoot);
 assert.equal(first.length,81);
 assert.equal(first.filter(x=>x.apiName.startsWith('One')).length,41);
 assert.ok(first.some(x=>x===tenantOwned));
 const second=ensureBundledAppComponents(first, {records:{}}, catalog,manifestRoot);
 assert.equal(second.length,81);
 assert.deepEqual(second.map(x=>x.apiName), first.map(x=>x.apiName));
});
test('Server startup schedules Core registration and maintenance prevents writes',()=>{
 const source=readFileSync(resolve(dir,'src/index.ts'),'utf8');
 const startup=readFileSync(resolve(dir,'src/bootstrap/startup.ts'),'utf8');
 assert.match(source,/syncComponents:\s*syncBundledLibraryComponents/);
 assert.match(startup,/if \(!maintenanceMode\) void hooks\.syncComponents\(\)/);
});
