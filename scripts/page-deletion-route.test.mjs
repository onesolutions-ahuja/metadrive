import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerPageDeletionRoute,pageDeletionBlockers} from '../apps/server/src/modules/metadata/page-deletion-route.mjs';
const fixture=()=>({tenants:{t:{
 pages:[{apiName:'OldMenu',status:'Draft'},{apiName:'NewMenu',status:'Active'}],
 apps:[{apiName:'OrderApp',navigationPageApiNames:['NewMenu'],navigationOrder:[]}],
 flows:[],routeAliases:[]
}}});
function harness(initial=fixture()){
 let state=initial,handler,guard;
 const app={delete:(route,middleware,next)=>{assert.equal(route,'/api/metadata/pages/:apiName');guard=middleware;handler=next}};
 registerPageDeletionRoute(app,{permission:'real-OneEngine-guard',getPrincipal:()=>({tenantId:'t'}),
  getState:()=>state,isProtected:page=>page.scope==='platform-system',
  commit:async next=>{state=next}});
 const request=async name=>{
  const result={statusCode:200,body:null};
  const res={status(code){result.statusCode=code;return this},json(value){result.body=value;return this}};
  await handler({params:{apiName:name}},res);
  return result;
 };
 return {request,read:()=>state,guard};
}
test('deletion uses existing permission middleware and is tenant-scoped',async()=>{
 const h=harness();assert.equal(h.guard,'real-OneEngine-guard');
 const result=await h.request('OldMenu');
 assert.equal(result.statusCode,200);
 assert.deepEqual(h.read().tenants.t.pages.map(page=>page.apiName),['NewMenu']);
 assert.equal((await h.request('OtherTenantPage')).statusCode,404);
});
test('no deletion of pages referenced by navigation or Page Action metadata',async()=>{
 const h=harness();assert.equal((await h.request('NewMenu')).statusCode,409);
 const state=fixture();
 state.tenants.t.pages[1].components=[{properties:{actionFlows:{onClick:{actionType:'Navigate',navigationPageApiName:'OldMenu'}}}}];
 assert.deepEqual(pageDeletionBlockers(state.tenants.t,'OldMenu'),['Page action: NewMenu']);
 assert.equal((await harness(state).request('OldMenu')).statusCode,409);
});
test('protected pages cannot be deleted, even with manage permission',async()=>{
 const s=fixture();s.tenants.t.pages[0].scope='platform-system';
 assert.equal((await harness(s).request('OldMenu')).statusCode,403);
});
