import test from 'node:test';
import assert from 'node:assert/strict';
import {executeOpenPageActionNode} from '../src/core/pages/PageRuntime/OpenPageActionNode';

const context={
 objects:[{apiName:'Account'}],
 apps:[{apiName:'CRM',navigationPageApiNames:['Home']}],
 pages:[{apiName:'Home',pageType:'App Page',status:'Active'}],
 currentAppId:'CRM',defaultObjectApiName:'Account'
};

test('Open Page action delegates a validated metadata route',()=>{
 let destination:unknown;
 const result=executeOpenPageActionNode({
  binding:{navigationTargetType:'App Page',navigationAppId:'CRM',navigationPageApiName:'Home'},
  context,onNavigate:route=>{destination=route;}
 });
 assert.deepEqual(result,{navigated:true});
 assert.deepEqual(destination,{kind:'app-page',appId:'CRM',pageApiName:'Home'});
});

test('Open Page action rejects unknown destination and never navigates',()=>{
 let called=false;
 assert.throws(()=>executeOpenPageActionNode({
  binding:{navigationTargetType:'App Page',navigationAppId:'CRM',navigationPageApiName:'Missing'},
  context,onNavigate:()=>{called=true;}
 }),/active App Page/);
 assert.equal(called,false);
});
