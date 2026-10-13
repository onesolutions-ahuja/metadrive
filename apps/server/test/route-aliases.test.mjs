import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRouteAliasInput, routeAliasDestination, validAliasSlug } from '../src/route-aliases.mjs';
const apps = [{apiName:'Shop',navigationPageApiNames:['Checkout'],navigationItems:['Account']}];
const objects = [{apiName:'Account'}];
const pages = [{apiName:'Checkout',pageType:'App Page',status:'Active',activationAssignments:[]}];
const context = {apps,objects,pages,canOpenApp:()=>true,canOpenTab:()=>true};
const alias = {slug:'checkout-now',appId:'Shop',kind:'App Page',targetApiName:'Checkout',status:'Active'};
test('strict slugs reject path traversal, external schemes and mixed-case collisions',()=>{
  for (const bad of ['../bad','/une/setup','https:','http://evil','A','test/path','demo?x=y','trailing-','a'.repeat(100),'__proto__']) {
    assert.equal(validAliasSlug(bad),false,bad);
  }
  assert(validAliasSlug('checkout-now'));
  assert.throws(()=>validateRouteAliasInput({...alias,expectedVersion:0,slug:'../bad'}));
});
test('alias validator enforces versions and only metadata targets',()=>{
  assert.equal(validateRouteAliasInput({...alias,expectedVersion:0}).kind,'App Page');
  for (const bad of [{expectedVersion:-1},{expectedVersion:0.5},{kind:'External URL'},{status:'Draft'},{targetApiName:'../../secret'}]) {
    assert.throws(()=>validateRouteAliasInput({...alias,expectedVersion:0,...bad}));
  }
});
test('canonical route alias safely maps a current active page, list and home',()=>{
  assert.equal(routeAliasDestination(alias,context),'/une/apps/Shop/pages/Checkout');
  assert.equal(routeAliasDestination({...alias,kind:'App Home',targetApiName:'Shop'},context),'/une/apps/Shop/home');
  assert.equal(routeAliasDestination({...alias,kind:'Record List',targetApiName:'Account'},context),'/une/o/Account/list?filterName=AllAccounts&appId=Shop');
});
test('disabled, unassigned, draft, cross-tenant and unauthorized destinations fail closed',()=>{
  const blocked=[{...alias,status:'Disabled'},{...alias,appId:'Other'},
    {...alias,targetApiName:'Other'},{...alias,slug:'../bad'}];
  for(const item of blocked)assert.equal(routeAliasDestination(item,context),null);
  assert.equal(routeAliasDestination(alias,{...context,canOpenApp:()=>false}),null);
  assert.equal(routeAliasDestination({...alias,kind:'Record List',targetApiName:'Account'},
    {...context,canOpenTab:()=>false}),null);
  assert.equal(routeAliasDestination(alias,{...context,pages:[{...pages[0],status:'Draft'}]}),null);
});
