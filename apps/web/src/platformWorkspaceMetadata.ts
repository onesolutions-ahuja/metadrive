import {workspaces,setupNavigation} from './metadata';

/** Phase 4a-c: reuse canonical Setup, tenant and Object Manager workspaces.
 * These are metadata descriptors only. The existing runtime performs RBAC
 * checks for route access and each API operation.
 */
type SetupWorkspace=typeof workspaces[number];
export type PlatformWorkspaceDescriptor={
 id:string;label:string;group:string;
 permission:'metadata:read'|'metadata:write'|'platform:superadmin';
};
const restricted:Readonly<Record<string,PlatformWorkspaceDescriptor['permission']>>={
 'Tenant Management':'platform:superadmin',
 'Object Manager':'metadata:read',
 'Company Information':'metadata:read',
 'Currencies':'metadata:read'
};
export function platformWorkspaceDescriptors():PlatformWorkspaceDescriptor[]{
 const byLabel=new Map<string,SetupWorkspace>(workspaces.map(w=>[w.label,w]));
 const descriptors:PlatformWorkspaceDescriptor[]=[];
 for(const group of setupNavigation){
  for(const label of group.items){
   const matched=byLabel.get(label);
   if(!matched)continue;
   descriptors.push({id:matched.id,label,group:group.group,
    permission:restricted[label]??'metadata:read'});
  }
 }
 return descriptors;
}
export function permittedPlatformWorkspaces(
 granted:ReadonlySet<string>,descriptors=platformWorkspaceDescriptors()
):PlatformWorkspaceDescriptor[]{
 return descriptors.filter(item=>granted.has(item.permission));
}
export type PlatformEditorBinding={
 workspaceId:string;objectApiName?:string;mode:'view'|'edit';
};
export function validatePlatformEditorBinding(
 binding:PlatformEditorBinding,availableObjectApiNames:ReadonlySet<string>,
 granted:ReadonlySet<string>
):string[]{
 const workspace=platformWorkspaceDescriptors().find(item=>item.id===binding.workspaceId);
 if(!workspace)return ['Unknown platform workspace'];
 if(!granted.has(workspace.permission))return ['Workspace permission denied'];
 if(!['view','edit'].includes(binding.mode))return ['Invalid editor mode'];
 if(binding.mode==='edit'&&!granted.has('metadata:write'))
  return ['Metadata write permission denied'];
 if(binding.workspaceId==='object-manager'&&
   (typeof binding.objectApiName!=='string'||!availableObjectApiNames.has(binding.objectApiName)))
  return ['Object metadata unavailable'];
 return [];
}
