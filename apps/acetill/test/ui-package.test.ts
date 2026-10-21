import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ACETILL} from '../src/manifest.js';

const sql=readFileSync(fileURLToPath(new URL('../sql/register-v2.sql',import.meta.url)),'utf8');

test('SQL template declares all Acetill pages and shared One components',()=>{
 for(const {apiName} of ACETILL.pages)assert.match(sql,new RegExp("'"+apiName+"'"));
 for(const component of ['OneText','OneBadge','OneSearch','OneItemGrid','OneShoppingCart','OneButton'])
   assert.match(sql,new RegExp("'"+component+"'"));
 assert.match(sql,/md_app_package_page_component_templates/);
 assert.match(sql,/md_app_package_page_property_templates/);
});
test('Acetill publishes metadata without seeding business records or granting implicit access',()=>{
 assert.doesNotMatch(sql,/INSERT INTO md_records|INSERT INTO md_users|INSERT INTO md_permission_assignments/i);
 assert.match(sql,/2,true/);
 assert.match(sql,/md_app_package_home_page_templates/);
 assert.match(sql,/2,'Field',f\.api_name,'Product'/);
});
test('checkout and receipt actions require named active Flows at runtime',()=>{
 assert.match(sql,/actionFlows\.checkout\.flowApiName','string','AcetillCompleteSale'/);
 assert.match(sql,/actionFlows\.click\.flowApiName','string','AcetillPrintReceipt'/);
 assert.doesNotMatch(sql,/disabled','boolean','true'/);
});
test('catalogue and basket bind shared Product fields and same cart state',()=>{
 assert.match(sql,/OneItemGrid','main',20,'objectApiName','string','Product'/);
 assert.match(sql,/OneItemGrid','main',20,'cartTargetKey','string','acetill'/);
 assert.match(sql,/OneShoppingCart','sidebar',30,'cartTargetKey','string','acetill'/);
});

test('standalone entrypoint uses the shared product-aware workspace shell',()=>{
 const main=readFileSync(fileURLToPath(new URL('../../web/src/main.tsx',import.meta.url)),'utf8');
 const app=readFileSync(fileURLToPath(new URL('../../web/src/core/workspace/App/App.tsx',import.meta.url)),'utf8');
 assert.doesNotMatch(main,/import\(['"]\.\.\/\.\.\/acetill\/src\/AcetillShell/);
 assert.match(main,/isMarketingHome/);
 assert.match(app,/standaloneCanonicalPath\(window\.location\.pathname/);
 assert.match(app,/resolveStandaloneEntry\(entryPath/);
 assert.match(app,/window\.location\.replace\('\/login'\)/);
 assert.match(app,/if \(authState === 'anonymous'\) return <Login onStart=/);
 assert.match(app,/LazyStandaloneRuntime entry=\{standaloneEntry\}/);
});

test('standalone Flow actions use server authorization without requiring Flow Definition read',()=>{
 const standalone=readFileSync(fileURLToPath(new URL('../../web/src/core/workspace/Standalone/StandaloneRuntime.tsx',import.meta.url)),'utf8');
 const pageRuntime=readFileSync(fileURLToPath(new URL('../../web/src/core/pages/PageRuntime/pageRuntimeViews.tsx',import.meta.url)),'utf8');
 assert.doesNotMatch(standalone,/\/metadata\/flows/);
 assert.match(pageRuntime,/binding\.flowType/);
 assert.match(sql,/actionFlows\.checkout\.flowType','string','Autolaunched Flow'/);
 assert.match(pageRuntime,/loadCompanySettings: \(\) => apiRequest\('\/metadata\/currencies'\)/);
});
