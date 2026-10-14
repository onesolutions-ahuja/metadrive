/** Reserved MetaDrive system-page names are protected by central platform grants.
 * This module does not grant permissions, persist state or create new routes.
 */
const prefix='MetaDriveSystem_';
export function isProtectedSystemPage(value:unknown):boolean{
 return typeof value==='string' && value.startsWith(prefix);
}
export function canWritePageMetadata(existingPage:{apiName?:string}|undefined,
 proposedPage:{apiName?:string},permissions:readonly string[]):boolean{
 const protectedMutation=isProtectedSystemPage(existingPage?.apiName)
  ||isProtectedSystemPage(proposedPage.apiName);
 return !protectedMutation || permissions.includes('platform:superadmin');
}
export function visiblePageMetadata<T extends {apiName:string}>(
 pages:readonly T[],permissions:readonly string[]):T[]{
 return permissions.includes('platform:superadmin')?[...pages]:
  pages.filter(page=>!isProtectedSystemPage(page.apiName));
}
