export interface ProtectedPage {
 apiName:string;scope?:'tenant'|'platform-system';ownerNamespace?:string;
 requiredPermissions?:string[];overridePolicy?:'presentation-only'|'none';
}
export const protectedWorkspacePageDescriptors:ReadonlyArray<{workspace:string;label:string;permission:string}>;
export function protectedPageApiName(workspace:string):string;
export function isProtectedAdministrationPage(page:unknown):boolean;
export function protectedAdministrationPage(descriptor:{workspace:string;label:string;permission:string}):ProtectedPage;
export function seedProtectedAdministrationPages<T extends {pages:ProtectedPage[]}>(tenant:T):T;
export function validateProtectedAdministrationPageUpdate(
 existing:ProtectedPage|undefined,proposed:ProtectedPage,permissions:readonly string[]
):string|null;
