import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSharedInteraction} from '../apps/web/src/sharedInteractionMetadata.ts';
import {resolveSharedResponsive} from '../apps/web/src/sharedResponsiveMetadata.ts';
import {auditSharedComponentRegistry} from '../apps/web/src/sharedComponentRegistryAudit.ts';
const context={objects:[{apiName:'Account'}],apps:[{apiName:'Sales',navigationPageApiNames:['Home']}],pages:[{apiName:'Home',pageType:'App Page',status:'Active'}],currentAppId:'Sales',defaultObjectApiName:'Account'};
test('3e routes to an active metadata page and requires accessible interactions',()=>{
 assert.equal(resolveSharedInteraction({kind:'navigation',label:'Home',eventName:'open',target:{navigationTargetType:'App Page',navigationPageApiName:'Home'}},context).route.kind,'app-page');
 assert.throws(()=>resolveSharedInteraction({kind:'dialog',label:'',eventName:'open'},context));
 assert.deepEqual(resolveSharedInteraction({kind:'dialog',label:'Confirm',eventName:'open'},context),{kind:'dialog',accessibleName:'Confirm',restoreFocus:true,modal:true});
});
test('3f resolves responsive styles through the canonical layout engine',()=>{
 const result=resolveSharedResponsive({type:'Grid',properties:{visualStyle:{desktopColumns:3,mobileColumns:1}}},'Phone');
 assert.equal(result.style.gridTemplateColumns,'repeat(1, minmax(0, 1fr))');
 assert.equal(resolveSharedResponsive({type:'Container',properties:{},visible:false},'Desktop').hidden,true);
});
test('3g rejects missing permissions, unpublished components, and wrong surfaces',()=>{
 const component={apiName:'SharedButton',status:'Published',surfaces:['page'],version:1};
 const req=[{apiName:'SharedButton',surface:'page'}];
 assert.deepEqual(auditSharedComponentRegistry(req,[component],new Set(['SharedButton'])),[]);
 assert.equal(auditSharedComponentRegistry(req,[component],new Set()).length,1);
 assert.equal(auditSharedComponentRegistry([{apiName:'SharedButton',surface:'flow'}],[component],new Set(['SharedButton'])).length,1);
});
