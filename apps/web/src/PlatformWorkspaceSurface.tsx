import React,{type ReactNode} from 'react';
import {platformNavigationEntries} from './platformWorkspaceMetadata';
import type {LightningPageMetadata,LibraryComponentMetadata} from './metadata';
import {findRegisteredComponent} from './componentRegistryLookup';
import RegisteredComponent from './RegisteredComponent';
import MetadataBoundPageComponent from './MetadataBoundPageComponent';
import {needsMetadataComponentRuntime} from './pageComponentBindings';
import {PlatformPageSlotsProvider} from './PlatformPageSlot';
import {resolvePageComponentStyle} from './pageComponentLayout';

/** Shared, registry-resolved platform presentation wrapper.
 * The enclosing Setup route and every OneEngine API retain their RBAC gates.
 * A client-side descriptor does not grant permissions or execute actions.
 */
export type SystemWorkspaceId='app-manager'|'app-exchange'|'tenant-management'|'rbac'|'company-settings'|'object-manager'|'named-credentials'|'approval-processes'|'automation-settings'|'connector-settings';
const supported:ReadonlySet<string>=new Set(['app-manager','app-exchange','tenant-management','rbac','company-settings','object-manager','named-credentials','approval-processes','automation-settings','connector-settings']);
const descriptions:Readonly<Record<SystemWorkspaceId,string>>={
 'app-manager':'Configure applications and navigation',
 'app-exchange':'Manage installed applications',
 'tenant-management':'Manage authorised tenant administration',
 'rbac':'Manage users, profiles and sharing',
 'company-settings':'Manage company settings',
 'object-manager':'Configure object metadata',
 'named-credentials':'Manage named credentials and secrets',
 'approval-processes':'Manage approval definitions',
 'automation-settings':'Configure process execution policies',
 'connector-settings':'Manage connector configuration'
};
export function resolveSystemWorkspace(id:string){
 if(!supported.has(id))return undefined;
 const matches=platformNavigationEntries().filter(entry=>entry.id===id);
 const primary=matches[0];
 if(!primary)return undefined;
 return {id:id as SystemWorkspaceId,label:primary.label,description:descriptions[id as SystemWorkspaceId],
  requiredPermission:primary.permission,aliases:matches.map(entry=>entry.label)};
}
export default function PlatformWorkspaceSurface({
 workspace,children,permitted=false,pages=[],libraryComponents=[],canEditSystemPage=false,onEditSystemPage,device='Desktop',componentRuntime
}:{
 workspace:SystemWorkspaceId;children:ReactNode;permitted:boolean;
 pages?:readonly LightningPageMetadata[];libraryComponents?:readonly LibraryComponentMetadata[];
 canEditSystemPage?:boolean;onEditSystemPage?:(apiName:string)=>void;device?:'Desktop'|'Tablet'|'Phone';
 componentRuntime?:Pick<React.ComponentProps<typeof MetadataBoundPageComponent>,
  'apiRequest'|'objects'|'apps'|'pages'|'currentAppId'|'reports'|'availableFlows'|'formFactor'|'onNavigate'|'onLaunchFlow'>;
}){
 const definition=resolveSystemWorkspace(workspace);
 if(!definition||!permitted)return <div role="alert">Workspace unavailable</div>;
 const pageName='MetaDrive_Admin_'+workspace.replace(/-/g,'_');
 const page=pages.find(item=>item.apiName===pageName&&item.scope==='platform-system'&&item.ownerNamespace==='MetaDrive'&&item.status==='Active'&&Array.isArray(item.requiredPermissions)&&item.requiredPermissions.length===1&&item.requiredPermissions[0]===definition.requiredPermission);
 const registered=page?.components.filter(instance=>instance.visible&&!instance.properties.platformSlotKey&&instance.type.startsWith('Custom:'))
  .map(instance=>({
    instance,component:findRegisteredComponent(libraryComponents,instance.type.slice('Custom:'.length),'page')
  })).filter(item=>item.component)??[];
 return <section className="platform-workspace-surface" data-workspace={definition.id}
   aria-label={definition.label} data-metadata-source="platform-workspace-registry">
   {page&&<div className="platform-system-page" aria-label={page.label}>
     {canEditSystemPage&&onEditSystemPage&&<button type="button" className="btn btn-small"
       onClick={()=>onEditSystemPage(page.apiName)}>Edit page layout</button>}
     <div className="platform-system-page-components" style={{display:'flex',flexWrap:'wrap',gap:12}}>
       {registered.map(({instance,component})=><div key={instance.id}
         style={{...resolvePageComponentStyle(instance.properties,instance.type,device),
           maxWidth:'100%',width:instance.position?.width??'100%'}}>
         {needsMetadataComponentRuntime(instance.properties)
           ?componentRuntime
             ?<MetadataBoundPageComponent {...componentRuntime} definition={component!}
               component={instance} pageSessionKey={'platform:'+pageName}/>
             :<div role="alert">Page action runtime unavailable</div>
           :<RegisteredComponent definition={component!} props={instance.properties}/>}
       </div>)}
     </div>
   </div>}
   {page?<PlatformPageSlotsProvider page={page} libraryComponents={libraryComponents}>{children}</PlatformPageSlotsProvider>:children}
 </section>;
}
