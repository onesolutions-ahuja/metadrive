/** Reserved MetaDrive system-page names are protected by central platform grants.
 * This module does not grant permissions, persist state or create new routes.
 */
const prefix='MetaDriveSystem_';
export function isProtectedSystemPage(value:unknown):boolean{
 return typeof value==='string' && value.toLowerCase().startsWith(prefix.toLowerCase());
}
export function validSystemPageScope(page:{apiName?:string;scope?:string;ownerNamespace?:string}):boolean{
 if(isProtectedSystemPage(page.apiName))return page.scope==='platform-system'&&page.ownerNamespace==='MetaDrive';
 return page.scope!=='platform-system';
}
export function canWritePageMetadata(existingPage:{apiName?:string;scope?:string}|undefined,
 proposedPage:{apiName?:string;scope?:string},permissions:readonly string[]):boolean{
 const protectedMutation=isProtectedSystemPage(existingPage?.apiName)
  ||isProtectedSystemPage(proposedPage.apiName)
  ||existingPage?.scope==='platform-system'||proposedPage.scope==='platform-system';
 return !protectedMutation || permissions.includes('platform:superadmin');
}
export function visiblePageMetadata<T extends {apiName:string;scope?:string}>(
 pages:readonly T[],permissions:readonly string[]):T[]{
 return permissions.includes('platform:superadmin')?[...pages]:
  pages.filter(page=>!isProtectedSystemPage(page.apiName)&&page.scope!=='platform-system');
}
