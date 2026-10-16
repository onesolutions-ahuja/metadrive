import test from 'node:test';
import assert from 'node:assert/strict';
import { browserRoutePath, listPageRoutes } from '../apps/web/src/routeDirectory.ts';

const apps = [
  { apiName:'Shop',label:'Shop',navigationItems:['Account','Missing__c','Account'],
    navigationPageApiNames:['Store_Page','Draft_Page','Missing_Page'] },
  { apiName:'Service',label:'Service',navigationItems:['Contact'],
    navigationPageApiNames:[] }
];
const objects = [{apiName:'Account',label:'Accounts'},{apiName:'Contact',label:'Contacts'}];
const pages = [
  {apiName:'Store_Page',label:'Shop Home',pageType:'App Page',status:'Active',activationAssignments:[]},
  {apiName:'Draft_Page',label:'Draft preview',pageType:'App Page',status:'Draft',activationAssignments:[]},
  {apiName:'Service_Page',label:'Service Panel',pageType:'App Page',status:'Active',
    activationAssignments:[{appId:'Service'}]},
];
const routes=listPageRoutes(apps,objects,pages);
const route=(app,kind,id)=>routes.find(r=>r.appId===app&&r.kind===kind&&r.targetApiName===id);
test('provides canonical URLs and stable deduplicated routes from app metadata',()=>{
  assert.equal(route('Shop','App Home','Shop').path,'/une/apps/Shop/home');
  assert.equal(route('Shop','App Page','Store_Page').path,'/une/apps/Shop/pages/Store_Page');
  assert.equal(route('Shop','Record List','Account').path,
    '/une/o/Account/list?filterName=AllAccounts&appId=Shop');
  assert.equal(routes.filter(x=>x.appId==='Shop'&&x.kind==='Record List'&&x.targetApiName==='Account').length,1);
  assert.equal(route('Service','App Page','Service_Page').available,true);
});
test('draft, deleted, incorrect and stale destinations are never offered as open links',()=>{
  assert.equal(route('Shop','App Page','Draft_Page').available,false);
  assert.match(route('Shop','App Page','Draft_Page').reason,/draft/);
  assert.equal(route('Shop','App Page','Missing_Page').available,false);
  assert.match(route('Shop','App Page','Missing_Page').reason,/no longer exists/);
  assert.equal(route('Shop','Record List','Missing__c').available,false);
  assert.match(route('Shop','Record List','Missing__c').reason,/not found/);
});
test('application-specific route filters do not leak entries from other app contexts',()=>{
  const scoped=listPageRoutes(apps,objects,pages,'Service');
  assert(scoped.length);
  assert(scoped.every(x=>x.appId==='Service'));
  assert.deepEqual(listPageRoutes(apps,objects,pages,'Unknown_App'),[]);
});
test('paths retain GitHub Pages base without external redirect or protocol injection',()=>{
  assert.equal(browserRoutePath('/metadrive/','/une/apps/Shop/home'),'/metadrive/une/apps/Shop/home');
  assert.equal(browserRoutePath('/','/une/apps/Shop/home'),'/une/apps/Shop/home');
  assert.throws(()=>browserRoutePath('//evil.com','/une/apps/Shop/home'));
  assert.throws(()=>browserRoutePath('/metadrive/','https://evil.com'));
  assert.throws(()=>browserRoutePath('/metadrive/','//evil.com/une/apps/Shop/home'));
  assert.throws(()=>browserRoutePath('/metadrive/','/une/apps/Shop/pages/A#bad'));
});
