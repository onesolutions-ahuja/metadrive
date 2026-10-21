import test from 'node:test';
import assert from 'node:assert/strict';
import {ACETILL} from '../src/manifest.js';
import {parseAppRoute} from '../../web/src/core/workspace/Navigation/appRouting.js';
import {buildAcetillNavigation,canOpenAcetill,isAcetillPage} from '../src/contract.js';

test('Acetill keeps administration and shared platform outside its package',()=>{
 assert.equal(ACETILL.auth,'metadrive-session');
 assert.equal(ACETILL.componentRegistry,'metadrive-one');
 assert.deepEqual([...ACETILL.requiredObjects],['Product','Cart','CartLine','Order','OrderLine']);
 assert.equal(ACETILL.pages.some(x=>x.apiName.includes('Manage')||x.apiName.includes('Report')),false);
});
test('register is inaccessible until every app and permission gate succeeds',()=>{
 const ready={authenticated:true,tenantResolved:true,entitled:true,installed:true,active:true,canUseRegister:true};
 assert.equal(canOpenAcetill(ready),true);
 for(const key of Object.keys(ready) as (keyof typeof ready)[])
  assert.equal(canOpenAcetill({...ready,[key]:false}),false,key);
});
test('only declared metadata pages enter navigation',()=>{
 assert.equal(isAcetillPage('AcetillSale'),true);
 assert.equal(isAcetillPage('ProductManagement'),false);
 assert.deepEqual(buildAcetillNavigation().map(x=>x.apiName),ACETILL.pages.map(x=>x.apiName));
});

test('public /acetill entrypoint retains shared authenticated app home routing',()=>{
 assert.deepEqual(parseAppRoute('/acetill'),{kind:'app-home',appId:'Acetill'});
 assert.deepEqual(parseAppRoute('/une/apps/Acetill/home'),{kind:'app-home',appId:'Acetill'});
 assert.deepEqual(parseAppRoute('/une/setup/home'),{kind:'setup',workspace:'home'});
});
