import test from 'node:test';
import assert from 'node:assert/strict';
import {platformWorkspaceDescriptors,permittedPlatformWorkspaces,validatePlatformEditorBinding} from '../apps/web/src/platformWorkspaceMetadata.ts';
test('4a setup shell derives workspaces from existing navigation metadata',()=>{
 const entries=platformWorkspaceDescriptors();
 assert.ok(entries.some(e=>e.id==='home'));
 assert.ok(entries.some(e=>e.id==='object-manager'));
 assert.equal(new Set(entries.map(e=>e.id)).size,entries.length);
});
test('4b tenant settings require central tenant administrator grant',()=>{
 const entries=platformWorkspaceDescriptors();
 assert.equal(entries.find(e=>e.id==='tenant-management').permission,'platform:superadmin');
 assert.equal(permittedPlatformWorkspaces(new Set(['metadata:read'])).some(e=>e.id==='tenant-management'),false);
});
test('4c object manager requires existing object references and write RBAC',()=>{
 const objects=new Set(['Account']);
 const reader=new Set(['metadata:read']);
 assert.deepEqual(validatePlatformEditorBinding({workspaceId:'object-manager',objectApiName:'Account',mode:'view'},objects,reader),[]);
 assert.ok(validatePlatformEditorBinding({workspaceId:'object-manager',objectApiName:'Unknown',mode:'view'},objects,reader).length);
 assert.ok(validatePlatformEditorBinding({workspaceId:'object-manager',objectApiName:'Account',mode:'edit'},objects,reader).length);
 assert.deepEqual(validatePlatformEditorBinding({workspaceId:'object-manager',objectApiName:'Account',mode:'edit'},objects,new Set(['metadata:read','metadata:write'])),[]);
});
