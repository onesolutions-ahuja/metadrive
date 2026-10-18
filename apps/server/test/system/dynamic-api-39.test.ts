import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createSystemServer} from '../../src/system-support/server.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

// This matrix maps the 39 dynamic fetch/API call sites from the October 18 SQL API audit.
// Every test is a real registered Express method+path contract check (not a generated 404).
// Metadata-configured endpoint references are marked unresolved, never automatically counted as passed.
type Contract={method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE';path:string};
type Item={id:number;source:string;description:string;contracts:Contract[];unresolved?:string};
const matrix:Item[]=[
 {id:1,source:'App.tsx',description:'App homepage',contracts:[{method:'GET',path:'/apps/Demo/home-page'}]},
 {id:2,source:'EmbeddedDashboard.tsx',description:'Embedded report run',contracts:[{method:'POST',path:'/reports/Sales/run'}]},
 {id:3,source:'EmbeddedDashboard.tsx',description:'Embedded dashboard data',contracts:[{method:'GET',path:'/metadata/dashboards/Sales/data/Invoice'}]},
 {id:4,source:'MetadataBoundPageComponent.tsx',description:'Metadata channel access endpoint',contracts:[],unresolved:'channelAccessPath is metadata-selected; validate resolved path and user RBAC at runtime'},
 {id:5,source:'MetadataBoundPageComponent.tsx',description:'Metadata Flow action',contracts:[{method:'POST',path:'/flows/DemoFlow/execute'}]},
 {id:6,source:'PageRouteDirectory.tsx',description:'Write route alias',contracts:[{method:'PUT',path:'/metadata/route-aliases/Demo/home'}]},
 {id:7,source:'PageRouteDirectory.tsx',description:'Delete route alias',contracts:[{method:'DELETE',path:'/metadata/route-aliases/Demo/home'}]},
 {id:8,source:'TenantDomains.tsx',description:'Tenant/platform domain lists',contracts:[{method:'GET',path:'/tenant/domains'},{method:'GET',path:'/platform/tenants/demo/domains'}]},
 {id:9,source:'TenantDomains.tsx',description:'Register, verify and remove tenant/platform domains',contracts:[
  {method:'POST',path:'/tenant/domains'},{method:'POST',path:'/tenant/domains/example.com/verify'},
  {method:'DELETE',path:'/tenant/domains/example.com'},{method:'POST',path:'/platform/tenants/demo/domains'},
  {method:'POST',path:'/platform/tenants/demo/domains/example.com/verify'},
  {method:'DELETE',path:'/platform/tenants/demo/domains/example.com'}]},
 {id:10,source:'TenantManagement.tsx',description:'List platform tenants',contracts:[{method:'GET',path:'/platform/tenants'}]},
 {id:11,source:'TenantManagement.tsx',description:'Get one platform tenant',contracts:[{method:'GET',path:'/platform/tenants/demo'}]},
 {id:12,source:'TenantManagement.tsx',description:'Update tenant metadata',contracts:[{method:'PATCH',path:'/platform/tenants/demo'}]},
 {id:13,source:'TenantManagement.tsx',description:'Suspend/reactivate tenant',contracts:[{method:'POST',path:'/platform/tenants/demo/suspend'},{method:'POST',path:'/platform/tenants/demo/reactivate'}]},
 {id:14,source:'TenantManagement.tsx',description:'Archive/restore tenant',contracts:[{method:'POST',path:'/platform/tenants/demo/archive'},{method:'POST',path:'/platform/tenants/demo/restore'}]},
 {id:15,source:'TenantManagement.tsx',description:'Change tenant retention',contracts:[{method:'PATCH',path:'/platform/tenants/demo/retention'}]},
 {id:16,source:'TenantRecoveryPanel.tsx',description:'Tenant recovery commands',contracts:[
  {method:'POST',path:'/platform/recovery/cases'},{method:'POST',path:'/platform/recovery/cases/123/approve'},
  {method:'POST',path:'/platform/recovery/cases/123/invite'},
  {method:'POST',path:'/tenant/recovery/contacts'},
  {method:'POST',path:'/tenant/recovery/cases/123/claim'}]},
 {id:17,source:'TenantRecoveryPanel.tsx',description:'Recovery case details',contracts:[{method:'GET',path:'/platform/recovery/cases/123'}]},
 {id:18,source:'TenantUsagePanel.tsx',description:'Tenant and platform usage',contracts:[{method:'GET',path:'/tenant/usage'},{method:'GET',path:'/platform/tenants/demo/usage'}]},
 {id:19,source:'TenantUsagePanel.tsx',description:'Tenant/platform usage warning targets',contracts:[{method:'PATCH',path:'/tenant/usage-targets'},{method:'PATCH',path:'/platform/tenants/demo/usage-targets'}]},
 {id:20,source:'pageRuntimeViews.tsx',description:'Page metadata channel access endpoint',contracts:[],unresolved:'channelAccessPath originates from metadata; require scoped route validation'},
 {id:21,source:'pageRuntimeViews.tsx',description:'Page Flow execution',contracts:[{method:'POST',path:'/flows/DemoFlow/execute'}]},
 {id:22,source:'pageRuntimeViews.tsx',description:'App page/home runtime',contracts:[{method:'GET',path:'/apps/Demo/pages/Home'},{method:'GET',path:'/apps/Demo/home-page'}]},
 {id:23,source:'recordWorkspaceViews.tsx',description:'Offline generic record synchronisation',contracts:[{method:'POST',path:'/records/Invoice'},{method:'PUT',path:'/records/Invoice/123'},{method:'DELETE',path:'/records/Invoice/123'}]},
 {id:24,source:'recordWorkspaceViews.tsx',description:'Create/update records',contracts:[{method:'POST',path:'/records/Invoice'},{method:'PUT',path:'/records/Invoice/123'}]},
 {id:25,source:'recordWorkspaceViews.tsx',description:'Paginated record export',contracts:[{method:'GET',path:'/records/Invoice'}]},
 {id:26,source:'settingsWorkspaceViews.tsx',description:'User lock/unlock',contracts:[{method:'POST',path:'/auth/users/123/lock'},{method:'POST',path:'/auth/users/123/unlock'}]},
 {id:27,source:'setupAppShell.tsx',description:'App route resolution',contracts:[{method:'GET',path:'/routes/resolve/Demo/home'}]},
 {id:28,source:'setupAppShell.tsx',description:'Integration Connection create/update',contracts:[{method:'POST',path:'/integration-connections'},{method:'PUT',path:'/integration-connections/Demo'}]},
 {id:29,source:'setupAppShell.tsx',description:'Lightning Page draft/publish',contracts:[{method:'PUT',path:'/metadata/pages/Home'},{method:'POST',path:'/metadata/pages/Home/publish'}]},
 {id:30,source:'setupAppShell.tsx',description:'Lightning Page Builder draft/publish',contracts:[{method:'PUT',path:'/metadata/pages/Home'},{method:'POST',path:'/metadata/pages/Home/publish'}]},
 {id:31,source:'setupAppShell.tsx',description:'Component Library creation/update',contracts:[{method:'POST',path:'/component-library'},{method:'PUT',path:'/component-library/SharedText'}]},
 {id:32,source:'setupAppShell.tsx',description:'App Manager create/update',contracts:[{method:'POST',path:'/metadata/apps'},{method:'PUT',path:'/metadata/apps/Demo'}]},
 {id:33,source:'setupFlowActions.ts',description:'Flow draft/publish',contracts:[{method:'PUT',path:'/metadata/flows/DemoFlow'},{method:'POST',path:'/metadata/flows/DemoFlow/publish'}]},
 {id:34,source:'setupFlowActions.ts',description:'Named Credential create/update',contracts:[{method:'POST',path:'/named-credentials'},{method:'PUT',path:'/named-credentials/123'}]},
 {id:35,source:'setupFlowActions.ts',description:'Email Alert create/update',contracts:[{method:'POST',path:'/metadata/email-alerts'},{method:'PUT',path:'/metadata/email-alerts/Example'}]},
 {id:36,source:'useRelationshipMentionContext.ts',description:'Related record field resolution',contracts:[{method:'GET',path:'/records/Customer/123'}]},
 {id:37,source:'useSetupAnalyticsActions.ts',description:'Dashboard subscription create/update',contracts:[{method:'POST',path:'/metadata/dashboards/Demo/subscriptions'},{method:'PUT',path:'/metadata/dashboards/Demo/subscriptions/123'}]},
 {id:38,source:'useSetupAnalyticsActions.ts',description:'Dashboard folder create/update',contracts:[{method:'POST',path:'/metadata/dashboard-folders'},{method:'PUT',path:'/metadata/dashboard-folders/Demo'}]},
 {id:39,source:'useSetupMetadata.ts',description:'Optional metadata bootstrap',contracts:[
  {method:'GET',path:'/metadata/flows'},{method:'GET',path:'/metadata/platform-events'},
  {method:'GET',path:'/metadata/email-alerts'},{method:'GET',path:'/metadata/approval-processes'},
  {method:'GET',path:'/connector-providers'},{method:'GET',path:'/integration-connections'}]}
];
function walk(folder:string):string[]{
 return readdirSync(folder,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(folder,x.name)):
  /\.(tsx?|jsx?)$/.test(x.name)?[path.join(folder,x.name)]:[]);
}
const srcRoot=fileURLToPath(new URL('../../../../apps/web/src/',import.meta.url));
const allFiles=walk(srcRoot);
const server=createSystemServer({} as SqlPersistence);
const routes=server._router.stack.flatMap((layer:any)=>
 layer.route ? Object.keys(layer.route.methods).filter(k=>layer.route.methods[k]).map(k=>({method:k.toUpperCase(),path:layer.route.path as string})) : []);
const match=(expected:string,registered:string)=>{
 const p=expected.split('/').filter(Boolean),r=registered.split('/').filter(Boolean);
 return p.length===r.length&&p.every((part,i)=>part===r[i]||r[i].startsWith(':'));
};
test('39 audited dynamic API call sites resolve to registered SQL runtime methods',()=>{
 assert.equal(matrix.length,39);
 const mismatches:string[]=[],unresolved:string[]=[];
 for(const item of matrix){
  const candidates=allFiles.filter(f=>path.basename(f)===item.source);
  if(!candidates.length){mismatches.push('#'+item.id+' source missing: '+item.source);continue;}
  if(!candidates.some(f=>/(?:apiRequest|request)\s*(?:<|\()/.test(readFileSync(f,'utf8'))))
   mismatches.push('#'+item.id+' source no longer calls API: '+item.source);
  if(item.unresolved){
   unresolved.push('#'+item.id+' '+item.unresolved);
   continue;
  }
  for(const contract of item.contracts){
   const matching=routes.filter(r=>r.method===contract.method&&match(contract.path,r.path));
   if(matching.length!==1)mismatches.push('#'+item.id+' '+contract.method+' /api'+contract.path+
    ': '+matching.length+' registered routes ('+item.description+')');
  }
 }
 console.log(JSON.stringify({callSites:matrix.length,routeAssertions:matrix.reduce((n,x)=>n+x.contracts.length,0),
  blockedOnMetadataReferences:unresolved,failures:mismatches},null,2));
 assert.deepEqual(mismatches,[],mismatches.join('\n'));
});
