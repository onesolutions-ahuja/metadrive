import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PlatformWorkspaceSurface from '../apps/web/src/PlatformWorkspaceSurface';
const page={apiName:'MetaDrive_Admin_app_manager',scope:'platform-system' as const,label:'App Manager',
  pageType:'App Page' as const,targetObject:'Account',layoutMode:'free-canvas' as const,
  ownerNamespace:'MetaDrive',requiredPermissions:['metadata:read'],definitionVersion:2,
  canvasWidth:1440,canvasHeight:900,status:'Active' as const,devices:['Desktop' as const],
  components:[]};
const render=(options:Record<string,unknown>)=>renderToStaticMarkup(React.createElement(PlatformWorkspaceSurface,{
 workspace:'app-manager',pages:[page],...options
},React.createElement('button',null,'Functional admin action')));
test('registered system page exposes Page Builder edit action only for platform admins',()=>{
 const reader=render({canEditSystemPage:false});
 assert.doesNotMatch(reader,/Edit page layout/);
 const admin=render({canEditSystemPage:true,onEditSystemPage:()=>{}});
 assert.match(admin,/Edit page layout/);
 assert.match(admin,/Functional admin action/);
});
test('system-page registration is not inferred from unprotected tenant metadata',()=>{
 const html=renderToStaticMarkup(React.createElement(PlatformWorkspaceSurface,{
 workspace:'app-manager',canEditSystemPage:true,onEditSystemPage:()=>{},
 pages:[{...page,scope:'tenant'}]
 },React.createElement('span',null,'Safe fallback')));
 assert.doesNotMatch(html,/Edit page layout/);
 assert.match(html,/Safe fallback/);
});
