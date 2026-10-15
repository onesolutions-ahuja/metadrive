import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PlatformPageSlotsProvider,PlatformPageSlot} from '../apps/web/src/PlatformPageSlot';

const page={
 apiName:'MetaDrive_Admin_app_manager',components:[{
  id:'admin-identity',type:'Custom:SystemPanel',label:'Identity',visible:true,
  properties:{platformSlotKey:'identity',systemWorkspaceId:'app-manager'}
 }]
};
const definition={
 apiName:'SystemPanel',label:'System Panel',surfaces:['page'],status:'Published',
 jsxSource:'',cssSource:'',scopedCss:'',updatedAt:'2026-10-14T00:00:00Z',
 version:1,trustedBundled:true,
 compiledJs:'module.exports.default = props => React.createElement("div", {"data-hosted-by":"registered-component"}, props.children);'
};
const render=(components=[])=>renderToStaticMarkup(React.createElement(PlatformPageSlotsProvider,
 {page,libraryComponents:components},
 React.createElement(PlatformPageSlot,{slotKey:'identity'},
  React.createElement('button',null,'Save configuration'))));
test('approved system slots host interactive children through trusted published component',()=>{
 const html=render([definition]);
 assert.match(html,/data-hosted-by="registered-component"/);
 assert.ok((html.match(/display:contents/g)||[]).length>=2,'Registered host must not add grid/flex wrappers');
 assert.match(html,/Save configuration/);
 assert.match(html,/data-platform-slot="identity"/);
});
test('draft and untrusted definitions never receive privileged interactive children',()=>{
 const draft=render([{...definition,status:'Draft'}]);
 const untrusted=render([{...definition,trustedBundled:false}]);
 for(const html of [draft,untrusted]){
  assert.doesNotMatch(html,/data-hosted-by="registered-component"/);
  assert.match(html,/Save configuration/);
 }
});

import PlatformWorkspaceSurface from '../apps/web/src/PlatformWorkspaceSurface';
test('protected custom page actions use the shared bound Object and Flow runtime',()=>{
 const actionPage={apiName:'MetaDrive_Admin_app_manager',scope:'platform-system',ownerNamespace:'MetaDrive',
  status:'Active',label:'App Manager',requiredPermissions:['metadata:read'],components:[{
   id:'action-1',type:'Custom:TestAction',visible:true,label:'Action',
   properties:{actionFlows:{click:{flowApiName:'Admin_Action_Flow'}}},
   position:{x:0,y:0,width:240,height:80}
  }]};
 const actionComponent={...definition,apiName:'TestAction',compiledJs:
  'module.exports.default = props => React.createElement("button", {"data-bound-action": typeof props.onAction === "function"}, "Execute");'};
 const context={apiRequest:async()=>({}),objects:[],apps:[],pages:[],reports:[],
  availableFlows:[],currentAppId:'Records',formFactor:'Desktop',
  onNavigate:()=>{},onLaunchFlow:()=>{}};
 const renderSurface=(permitted:boolean)=>renderToStaticMarkup(React.createElement(PlatformWorkspaceSurface,{
  workspace:'app-manager',permitted,pages:[actionPage],libraryComponents:[actionComponent],componentRuntime:context
 },React.createElement('div',null,'Admin workspace')));
 assert.match(renderSurface(true),/data-bound-action="true"/);
 assert.doesNotMatch(renderSurface(false),/data-bound-action/);
});
