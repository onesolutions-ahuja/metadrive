import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PlatformSystemPageRenderer,{eligibleSystemPage} from '../apps/web/src/PlatformSystemPageRenderer';
import {createSystemPageDrafts} from '../apps/web/src/platformSystemPageDrafts';
test('unpublished and nonmatching layouts preserve the secure administration implementation',()=>{
 const page=createSystemPageDrafts([]).find(p=>p.apiName.includes('_rbac_'))!;
 assert.equal(eligibleSystemPage(page,'rbac','metadata:read'),false);
 const html=renderToStaticMarkup(React.createElement(PlatformSystemPageRenderer,
  {page,workspace:'rbac',permission:'metadata:read',components:[]},React.createElement('button',null,'Save policy')));
 assert.match(html,/Save policy/);
});
test('published protected layouts render independently editable blocks and one secure content slot',()=>{
 const page=createSystemPageDrafts([]).find(p=>p.apiName.includes('_rbac_'))!;
 const duplicated={...page.components[1],id:'duplicate-host',position:{x:0,y:720,width:1100,height:50}};
 const active={...page,status:'Active' as const,components:[...page.components,duplicated]};
 assert.equal(eligibleSystemPage(active,'rbac','metadata:read'),true);
 const html=renderToStaticMarkup(React.createElement(PlatformSystemPageRenderer,
  {page:active,workspace:'rbac',permission:'metadata:read',components:[]},React.createElement('button',null,'Save policy')));
 assert.equal(html.match(/Save policy/g)?.length,1);
 assert.match(html,/data-page-instance="rbac-heading"/);
 assert.match(html,/data-page-instance="rbac-content"/);
});
test('metadata cannot select another privileged workspace or alter permission gates',()=>{
 const page=createSystemPageDrafts([]).find(p=>p.apiName.includes('_rbac_'))!;
 const active={...page,status:'Active' as const};
 assert.equal(eligibleSystemPage(active,'tenant-management','platform:superadmin'),false);
 assert.equal(eligibleSystemPage(active,'rbac','platform:superadmin'),false);
});
