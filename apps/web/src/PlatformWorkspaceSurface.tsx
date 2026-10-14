import React,{type ReactNode} from 'react';
import {platformNavigationEntries} from './platformWorkspaceMetadata';
import type {LightningPageMetadata,LibraryComponentMetadata} from './metadata';
import PlatformSystemPageRenderer,{eligibleSystemPage} from './PlatformSystemPageRenderer';

/** Shared, registry-resolved platform presentation wrapper.
 * The enclosing Setup route and every OneEngine API retain their RBAC gates.
 * A client-side descriptor does not grant permissions or execute actions.
 */
export type SystemWorkspaceId='home'|'company-settings'|'object-manager'|'app-manager'|'app-exchange'|'tenant-management'|'rbac';
const supported:ReadonlySet<string>=new Set(['home','company-settings','object-manager','app-manager','app-exchange','tenant-management','rbac']);
const descriptions:Readonly<Record<SystemWorkspaceId,string>>={
 'home':'Platform Setup',
 'company-settings':'Configure company information and tenant settings',
 'object-manager':'Configure Objects, fields and relationships',
 'app-manager':'Configure applications and navigation',
 'app-exchange':'Manage installed applications',
 'tenant-management':'Manage authorised tenant administration',
 'rbac':'Manage users, profiles and sharing'
};
export function resolveSystemWorkspace(id:string){
 if(!supported.has(id))return undefined;
 const matches=platformNavigationEntries().filter(entry=>entry.id===id);
 const primary=matches[0];
 if(!primary)return undefined;
 return {id:id as SystemWorkspaceId,label:primary.label,description:descriptions[id as SystemWorkspaceId],
  requiredPermission:primary.permission,aliases:matches.map(entry=>entry.label)};
}
export default function PlatformWorkspaceSurface({workspace,children,permitted=true,page,libraryComponents=[]}:{
 workspace:SystemWorkspaceId;children:ReactNode;permitted?:boolean;
 page?:LightningPageMetadata;libraryComponents?:readonly LibraryComponentMetadata[]
}){
 const definition=resolveSystemWorkspace(workspace);
 if(!definition||!permitted)return <div role="alert">Workspace unavailable</div>;
 return <section className="platform-workspace-surface" data-workspace={definition.id}
   aria-label={definition.label} data-metadata-source="platform-workspace-registry">
   {eligibleSystemPage(page,workspace,definition.requiredPermission)
    ? <PlatformSystemPageRenderer page={page!} workspace={workspace}
       permission={definition.requiredPermission} components={libraryComponents}>{children}</PlatformSystemPageRenderer>
    : children}
 </section>;
}
