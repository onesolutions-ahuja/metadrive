import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {systemWorkspaceSlots} from '../apps/web/src/platformSystemPageDrafts';
const read=(path:string)=>readFileSync(new URL('../apps/web/src/'+path,import.meta.url),'utf8');
test('every seeded administration control has an independently editable live component slot',()=>{
 const app=read('App.tsx'),manager=read('AppManager.tsx'),
  exchange=read('AppExchange.tsx'),tenants=read('TenantManagement.tsx');
 for(const [workspace,slots] of Object.entries(systemWorkspaceSlots)){
  for(const slot of slots){
   const source=workspace==='app-manager'?manager:
    workspace==='tenant-management'?tenants:
    workspace==='app-exchange'&&slot!=='marketplace'?exchange:app;
   assert.ok(source.includes('slotKey="'+slot+'"'),workspace+' '+slot+' is not wired into runtime');
  }
 }
});
test('no system workspace has duplicate Page Builder slot keys',()=>{
 for(const [workspace,slots] of Object.entries(systemWorkspaceSlots)){
  assert.equal(new Set(slots).size,slots.length,workspace);
 }
});
