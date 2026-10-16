import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSetupNavigation } from '../../apps/web/src/platformSetupNavigation.js';

test('Tenant Management stays discoverable in Setup even when platform policy is absent', () => {
 const withoutPrivilege=resolveSetupNavigation('',false);
 const withPrivilege=resolveSetupNavigation('',true);
 const group=(items:ReturnType<typeof resolveSetupNavigation>)=>
   items.find(item=>item.group==='Platform Administration');
 assert.deepEqual(group(withoutPrivilege)?.items,['Tenant Management']);
 assert.deepEqual(group(withPrivilege)?.items,['Tenant Management']);
 assert.equal(withoutPrivilege[0]?.group,'Platform Administration');
});

test('Quick Find locates Tenant Management regardless of access; visibility never grants permission',()=>{
 const items=resolveSetupNavigation('tenant manage',false);
 assert.equal(items.length,0,'Search is a simple substring, not a privilege escalation');
 const searched=resolveSetupNavigation('tenant',false);
 assert.deepEqual(searched.map(x=>x.items).flat(),['Tenant Management']);
 assert.ok(!searched.some(x=>x.group==='Security'));
});
