import type {LightningPageMetadata} from './metadata';
import {platformNavigationEntries} from './platformWorkspaceMetadata';

/** Stable, idempotent Page Builder definitions for existing protected Setup workspaces.
 * The platform routes and OneEngine server permissions remain authoritative.
 * These are draft metadata definitions until an authorised system publisher activates them.
 */
const workspaces=[
 ['home','Setup Home'],['company-settings','Company Information'],
 ['object-manager','Object Manager'],['app-manager','App Manager'],
 ['app-exchange','AppExchange'],['rbac','Users & Permissions'],
 ['tenant-management','Tenant Management']
] as const;
export const protectedSystemPageNamespace='MetaDriveSystem';
export function systemPageApiName(id:string){
 return protectedSystemPageNamespace+'_'+id.replace(/[^A-Za-z0-9]/g,'_')+'_Page';
}
export function createSystemPageDrafts(existing:readonly LightningPageMetadata[]):LightningPageMetadata[]{
 const saved=new Set(existing.map(p=>p.apiName));
 const entries=platformNavigationEntries();
 return workspaces.filter(([id])=>!saved.has(systemPageApiName(id))).map(([id,label])=>{
  const entry=entries.find(e=>e.id===id);
  if(!entry)throw Error('Missing registered protected workspace: '+id);
  const page:LightningPageMetadata={
   apiName:systemPageApiName(id),label:label+' Layout',targetObject:'',
   pageType:'App Page',layoutMode:'free-canvas',canvasWidth:1200,canvasHeight:800,
   status:'Draft',devices:['Desktop','Phone'],components:[
    {id:id+'-heading',type:'Rich Text',label:label,visible:true,
     properties:{text:label,layoutStyle:{width:1080},systemWorkspaceId:id}},
    {id:id+'-content',type:'Custom:SystemPanel',label:label+' Content',visible:true,
     properties:{title:label,description:'Protected administration workspace',
      systemWorkspaceId:id,requiredPermission:entry.permission,layoutContainer:true}}
   ]
  };
  return page;
 });
}
export function systemPageWorkspaceId(apiName:string):string|undefined{
 return workspaces.find(([id])=>systemPageApiName(id)===apiName)?.[0];
}
