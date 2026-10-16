import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {loadAppSeedCatalog} from '../../apps/server/src/seeders/catalog.mjs';
import {ensureBundledAppComponents} from '../../apps/server/src/bundled-app-components.mjs';

test('all independently installed app component bundles compile during tenant reconciliation',()=>{
 const catalog=loadAppSeedCatalog();
 const installations=catalog.packages.map((pkg:{appKey:string})=>({
  AppKey__c:pkg.appKey,Installed__c:true,LicenceStatus__c:'Trial'
 }));
 const components=ensureBundledAppComponents([],{
  records:{Connector_App__c:installations}
 },catalog,resolve('apps/web/src/custom-components'));
 const required=[...catalog.coreComponents,...catalog.packages.flatMap((pkg:{components?:{apiName:string}[]})=>pkg.components??[])];
 for(const descriptor of required){
  const component=components.find((item:{apiName:string})=>item.apiName===descriptor.apiName);
  assert.ok(component?.compiledJs,'Missing compiled installable component: '+descriptor.apiName);
 }
 const repeated=ensureBundledAppComponents(components,{
  records:{Connector_App__c:installations}
 },catalog,resolve('apps/web/src/custom-components'));
 assert.equal(repeated.length,components.length,'Repeatable seed must not duplicate installed components');
});
