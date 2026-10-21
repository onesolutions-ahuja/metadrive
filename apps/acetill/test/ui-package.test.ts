import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ACETILL} from '../src/manifest.js';

const sql=readFileSync(fileURLToPath(new URL('../sql/register-v1-draft.sql',import.meta.url)),'utf8');

test('SQL template declares all Acetill pages and shared One components',()=>{
 for(const {apiName} of ACETILL.pages)assert.match(sql,new RegExp("'"+apiName+"'"));
 for(const component of ['OneText','OneBadge','OneSearch','OneItemGrid','OneShoppingCart','OneButton'])
   assert.match(sql,new RegExp("'"+component+"'"));
 assert.match(sql,/md_app_package_page_component_templates/);
 assert.match(sql,/md_app_package_page_property_templates/);
});
test('Acetill never seeds business records or grants implicit access',()=>{
 assert.doesNotMatch(sql,/INSERT INTO md_records|INSERT INTO md_users|INSERT INTO md_permission_assignments/i);
 assert.match(sql,/1,false/);
 assert.doesNotMatch(sql,/UPDATE md_app_package_versions SET published\s*=\s*true/i);
});
test('flow-controlled UI actions cannot process transactions before publishing a Flow',()=>{
 assert.match(sql,/Complete sale \(connect Flow\)/);
 assert.match(sql,/Print receipt \(connect Flow\)/);
 assert.match(sql,/OneButton','main',20,'disabled','boolean','true'/);
 assert.match(sql,/OneButton','main',30,'disabled','boolean','true'/);
});
test('catalogue and basket bind shared Product fields and same cart state',()=>{
 assert.match(sql,/OneItemGrid','main',20,'objectApiName','string','Product'/);
 assert.match(sql,/OneItemGrid','main',20,'cartTargetKey','string','acetill'/);
 assert.match(sql,/OneShoppingCart','sidebar',30,'cartTargetKey','string','acetill'/);
});

test('standalone entrypoint mounts Acetill without importing full admin workspace',()=>{
 const shell=readFileSync(fileURLToPath(new URL('../src/AcetillShell.tsx',import.meta.url)),'utf8');
 const main=readFileSync(fileURLToPath(new URL('../../web/src/main.tsx',import.meta.url)),'utf8');
 assert.match(main,/isAcetillEntry/);
 assert.match(main,/<Acetill \/>/);
 assert.doesNotMatch(shell,/SetupApp|MarketingSite|AppExchange|object-manager/);
 assert.match(shell,/createLoginView/);
 assert.match(shell,/\/auth\/refresh\?landing=1/);
 assert.match(shell,/\/apps\/Acetill\/home-page/);
 assert.match(shell,/OneShoppingCart/);
 assert.match(shell,/previewOnly=\{true\}/);
});
