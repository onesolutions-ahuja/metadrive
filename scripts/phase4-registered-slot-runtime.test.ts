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
