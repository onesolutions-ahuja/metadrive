import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyComponentSqlMigration} from '../scripts/verify-component-sql-migration.mjs';
const core=Array.from({length:40},(_,i)=>({apiName:'One'+String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26),version:1}));
const catalog={coreComponents:core,packages:[{appKey:'shop',components:[{apiName:'ShopCart',version:2,surfaces:['page','flow']}]}]};
const definition=(apiName,other={})=>({apiName,status:'Published',surfaces:['page','flow','dashboard'],version:2,
  trustedBundled:true,compiledJs:'exports.default=()=>null',propertyDefinitions:[{propertyKey:'kind'}],...other});
const fixture=()=>({libraryComponents:[...core.map(c=>definition(c.apiName)),definition('ShopCart')],tenants:{alpha:{
  pages:[{apiName:'Home',components:[{id:'page-1',type:'Custom:ShopCart',properties:{libraryComponentId:'ShopCart'}}]}],
  dashboards:[{apiName:'Stats',components:[{type:'Custom',customComponentApiName:core[0].apiName}]}],
  flows:[{apiName:'Sale',elements:[{type:'Screen',config:{fields:[{type:'Custom Component',componentApiName:'ShopCart'}]}}],versions:[{elements:[{config:{fields:[{type:'Custom Component',componentApiName:core[1].apiName}]}}]}]}],
  records:{Connector_App__c:[{AppKey__c:'shop',Installed__c:true,LicenceStatus__c:'Licensed'}]}
}}});
test('Pages, dashboards, Screen Flows, archived versions and installed apps resolve SQL definitions',()=>{
  const state=fixture(),original=JSON.stringify(state),report=verifyComponentSqlMigration(state,'alpha',catalog);
  assert.equal(report.result,'PASS');
  assert.deepEqual(report.checked,{page:1,dashboard:1,flow:2,core:40,app:1});
  assert.equal(JSON.stringify(state),original);
  assert(!JSON.stringify(report).includes('page-1'));
});
test('invalid published metadata, outdated versions, and mismatched saved references fail closed',()=>{
  const state=fixture();
  state.libraryComponents=state.libraryComponents.filter(c=>c.apiName!==core[0].apiName);
  Object.assign(state.libraryComponents.find(c=>c.apiName==='ShopCart'),{status:'Draft',version:1});
  state.tenants.alpha.pages[0].components[0].properties.libraryComponentId='Wrong';
  const failures=verifyComponentSqlMigration(state,'alpha',catalog).failures.map(x=>x.code);
  for(const expected of ['MISSING_SQL_DEFINITION','NOT_PUBLISHED_FOR_SURFACE','OUTDATED_COMPONENT_VERSION','SAVED_COMPONENT_BINDING_MISMATCH'])
    assert(failures.includes(expected),expected);
});
test('unlicensed app and cross-tenant component reference are rejected',()=>{
  const state=fixture();state.tenants.alpha.records.Connector_App__c[0].LicenceStatus__c='Expired';
  assert(verifyComponentSqlMigration(state,'alpha',catalog).failures.some(x=>x.code==='UNINSTALLED_APP_REFERENCE'));
  state.libraryComponents.find(c=>c.apiName==='ShopCart').tenantId='beta';
  assert(verifyComponentSqlMigration(state,'alpha',catalog).failures.some(x=>x.code==='MISSING_SQL_DEFINITION'));
});
test('missing tenant or missing SQL collection never passes',()=>{
  assert.throws(()=>verifyComponentSqlMigration(fixture(),'beta',catalog),/Tenant/);
  const state=fixture();delete state.tenants.alpha.flows;
  assert(verifyComponentSqlMigration(state,'alpha',catalog).failures.some(x=>x.code==='MISSING_SQL_COLLECTION'));
});
