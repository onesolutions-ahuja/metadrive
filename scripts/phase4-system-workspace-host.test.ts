import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PlatformWorkspaceSurface,{resolveSystemWorkspace} from '../apps/web/src/PlatformWorkspaceSurface';
test('registered Phase 4 workspaces are resolved from the existing registry',()=>{
 for(const id of ['app-manager','app-exchange','tenant-management','rbac']){
  const entry=resolveSystemWorkspace(id);
  assert.ok(entry,id);
  assert.ok(entry.aliases.length,id);
 }
 assert.equal(resolveSystemWorkspace('not-registered'),undefined);
});
test('system workspace surface fails closed for denied platform access',()=>{
 const html=renderToStaticMarkup(React.createElement(PlatformWorkspaceSurface,
  {workspace:'tenant-management',permitted:false},React.createElement('button',null,'Edit tenant')));
 assert.match(html,/Workspace unavailable/);
 assert.doesNotMatch(html,/Edit tenant/);
});
test('authorised workspace retains existing interactive children',()=>{
 const html=renderToStaticMarkup(React.createElement(PlatformWorkspaceSurface,
  {workspace:'app-manager'},React.createElement('button',null,'Save')));
 assert.match(html,/data-metadata-source="platform-workspace-registry"/);
 assert.match(html,/Save/);
});
