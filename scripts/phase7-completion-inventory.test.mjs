import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inventoryTrackedSources,summarizeCompletionInventory} from './phase7-completion-inventory.mjs';
test('phase 7 inventory excludes runtime tenant data and ignores untracked files',()=>{
 const dir=mkdtempSync(join(tmpdir(),'metadrive-phase7-'));
 try{
  mkdirSync(join(dir,'apps/server/src'),{recursive:true});
  mkdirSync(join(dir,'data'),{recursive:true});
  writeFileSync(join(dir,'apps/server/src/core.ts'),'export const core=true;\n');
  writeFileSync(join(dir,'data/platform-state.json'),'PRIVATE');
  const results=inventoryTrackedSources({root:dir,tracked:['apps/server/src/core.ts']});
  assert.equal(results.length,1);
  assert.equal(results[0].lines,1);
  assert.equal(summarizeCompletionInventory(results).oversizedFiles,0);
 }finally{rmSync(dir,{force:true,recursive:true})}
});
test('phase 7 flags oversized legacy files instead of silently excluding them',()=>{
 const dir=mkdtempSync(join(tmpdir(),'metadrive-phase7-'));
 try{
  mkdirSync(join(dir,'apps/server/src'),{recursive:true});
  writeFileSync(join(dir,'apps/server/src/legacy.ts'),'const name="Kiosk";\n'.repeat(1001));
  const rows=inventoryTrackedSources({root:dir,tracked:['apps/server/src/legacy.ts']});
  assert.equal(rows[0].oversized,true);
  assert.equal(summarizeCompletionInventory(rows).platformBusinessReferences.length,1);
 }finally{rmSync(dir,{force:true,recursive:true})}
});
