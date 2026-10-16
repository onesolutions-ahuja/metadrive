import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedPageLibraryComponents } from '../apps/web/src/pageBuilderPalette.ts';

test('Page Builder exposes 40 published One components and preserves legacy definitions', () => {
 const core=Array.from({length:40},(_,i)=>({apiName:'OneCore'+i,surfaces:['page','dashboard','flow'],status:'Published'}));
 const legacy={apiName:'RecoveredShared0',surfaces:['page'],status:'Published'};
 const draft={apiName:'TenantDraft',surfaces:['page'],status:'Draft'};
 const dashboard={apiName:'DashboardOnly',surfaces:['dashboard'],status:'Published'};
 const result=publishedPageLibraryComponents([...core,legacy,draft,dashboard,core[0]]);
 assert.equal(result.length,41);
 assert.equal(result.filter(x=>x.apiName.startsWith('OneCore')).length,40);
 assert.ok(result.includes(legacy));
 assert.ok(!result.includes(draft));
 assert.ok(!result.includes(dashboard));
 assert.equal(result.filter(x=>x.apiName==='OneCore0').length,1);
});
