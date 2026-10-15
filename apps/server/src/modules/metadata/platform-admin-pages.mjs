/** Presentation-only slots for the existing protected OneEngine Page Builder. */
export const protectedWorkspacePageSlots=Object.freeze({"company-settings":["company-info","domains","developer-accounts","usage","recovery","mfa","email-recovery","locks","sessions","audit"],"object-manager":["object-workspace","object-list","object-heading","object-subnav","object-setting"],"app-manager":["identity","pages","assignments","navigation-items","navigation-order","utility","actions"],"app-exchange":["marketplace-search","marketplace-filters","marketplace-catalog","marketplace-details"],"rbac":["permissions","rbac-tabs","rbac-list","rbac-editor","rbac-help"],"tenant-management":["directory","tenant-details","tenant-domains","tenant-usage","tenant-recovery"]});
export function protectedAdministrationSlotComponents(workspace){
 const keys=protectedWorkspacePageSlots[workspace]??[];
 return keys.map((key,index)=>({
  id:'md-admin-'+workspace+'-'+key,type:'Custom:SystemPanel',
  label:key.replace(/-/g,' '),visible:true,region:'main',
  properties:{platformSlotKey:key,systemWorkspaceId:workspace},
  position:{x:0,y:32+index*80,width:1280,height:72}
 }));
}
/** Versioned additive seed for protected administration Page Builder layouts.
 * These are existing Lightning App Pages, never a second page renderer/store.
 * Control actions remain in the established OneEngine admin modules and RBAC.
 */
export const protectedWorkspacePageDescriptors=Object.freeze([
 {workspace:'company-settings',label:'Company Settings',permission:'metadata:read'},
 {workspace:'object-manager',label:'Object Manager',permission:'metadata:read'},
 {workspace:'app-manager',label:'App Manager',permission:'metadata:read'},
 {workspace:'app-exchange',label:'AppExchange',permission:'metadata:write'},
 {workspace:'rbac',label:'Users & Permissions',permission:'security:read'},
 {workspace:'tenant-management',label:'Tenant Management',permission:'platform:superadmin'}
]);
export const protectedPageApiName=workspace=>'MetaDrive_Admin_'+workspace.replace(/-/g,'_');
export function isProtectedAdministrationPage(page){
 return Boolean(page&&typeof page==='object'&&
  (page.scope==='platform-system'||(typeof page.apiName==='string'&&page.apiName.startsWith('MetaDrive_Admin_'))));
}
export function protectedAdministrationPage(descriptor){
 const apiName=protectedPageApiName(descriptor.workspace);
 return {
  apiName,label:descriptor.label,updatedAt:'2026-10-14T00:00:00.000Z',
  targetObject:'Account',pageType:'App Page',layoutMode:'free-canvas',template:'one-region',
  canvasWidth:1440,canvasHeight:Math.max(900,120+(protectedWorkspacePageSlots[descriptor.workspace]?.length??0)*80),status:'Active',devices:['Desktop','Phone'],
  components:protectedAdministrationSlotComponents(descriptor.workspace),activationAssignments:[],
  scope:'platform-system',ownerNamespace:'MetaDrive',definitionVersion:2,
  overridePolicy:'presentation-only',requiredPermissions:[descriptor.permission]
 };
}
/** Missing-only; never rewrite tenant customisations or existing privileged layouts. */
export function seedProtectedAdministrationPages(tenant){
 const pages=Array.isArray(tenant.pages)?tenant.pages:[];
 const existing=new Set(pages.map(page=>page.apiName));
 const additions=protectedWorkspacePageDescriptors
  .filter(item=>!existing.has(protectedPageApiName(item.workspace)))
  .map(protectedAdministrationPage);
 // Upgrade untouched v1 seed only. Any tenant edits retain their saved layout.
 const migrated=pages.map(page=>{
  const d=protectedWorkspacePageDescriptors.find(item=>protectedPageApiName(item.workspace)===page.apiName);
  if(!d||page.ownerNamespace!=='MetaDrive'||page.scope!=='platform-system'
   ||page.definitionVersion!==1||page.updatedAt!=='2026-10-14T00:00:00.000Z'
   ||page.status!=='Active'||page.layoutMode!=='template'
   ||!Array.isArray(page.components)||page.components.length!==0
   ||JSON.stringify(page.requiredPermissions)!==JSON.stringify([d.permission]))return page;
  const next=protectedAdministrationPage(d);
  return {...page,definitionVersion:next.definitionVersion,layoutMode:next.layoutMode,
   canvasHeight:next.canvasHeight,components:next.components};
 });
 return additions.length||migrated.some((page,i)=>page!==pages[i])
  ?{...tenant,pages:[...migrated,...additions]}:tenant;
}
export function validateProtectedAdministrationPageUpdate(existing,proposed,permissions){
 if(!isProtectedAdministrationPage(existing)&&!isProtectedAdministrationPage(proposed))return null;
 if(!permissions.includes('platform:superadmin'))return 'Platform administrator permission required';
 if(existing&&existing.apiName!==proposed.apiName)return 'Protected administration page cannot be renamed';
 if(proposed.scope!=='platform-system'||proposed.ownerNamespace!=='MetaDrive')
  return 'Protected administration page ownership cannot change';
 const canonical=protectedWorkspacePageDescriptors.find(item=>protectedPageApiName(item.workspace)===proposed.apiName);
 if(canonical&&JSON.stringify(proposed.requiredPermissions)!==JSON.stringify([canonical.permission]))
  return 'Protected administration page required permission cannot change';
 if(existing){
  for(const key of ['requiredPermissions','overridePolicy'])
   if(JSON.stringify(existing[key]??null)!==JSON.stringify(proposed[key]??null))
    return 'Protected administration page security metadata cannot change';
 }
 return null;
}
