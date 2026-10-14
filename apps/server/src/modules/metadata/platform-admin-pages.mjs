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
  canvasWidth:1440,canvasHeight:900,status:'Active',devices:['Desktop','Phone'],
  components:[],activationAssignments:[],
  scope:'platform-system',ownerNamespace:'MetaDrive',definitionVersion:1,
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
 return additions.length?{...tenant,pages:[...pages,...additions]}:tenant;
}
export function validateProtectedAdministrationPageUpdate(existing,proposed,permissions){
 if(!isProtectedAdministrationPage(existing)&&!isProtectedAdministrationPage(proposed))return null;
 if(!permissions.includes('platform:superadmin'))return 'Platform administrator permission required';
 if(existing&&existing.apiName!==proposed.apiName)return 'Protected administration page cannot be renamed';
 if(proposed.scope!=='platform-system'||proposed.ownerNamespace!=='MetaDrive')
  return 'Protected administration page ownership cannot change';
 if(existing){
  for(const key of ['requiredPermissions','overridePolicy'])
   if(JSON.stringify(existing[key]??null)!==JSON.stringify(proposed[key]??null))
    return 'Protected administration page security metadata cannot change';
 }
 return null;
}
