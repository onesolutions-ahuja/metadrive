import React,{type ReactNode} from 'react';
import type {LightningPageMetadata,LibraryComponentMetadata,PageComponentMetadata} from './metadata';
import {systemPageApiName} from './platformSystemPageDrafts';
import {findRegisteredComponent} from './componentRegistryLookup';
import RegisteredComponent from './RegisteredComponent';
import './PlatformSystemPageRenderer.css';
import {PlatformPageSlotsProvider} from './PlatformPageSlot';
import {resolvePageComponentStyle} from './pageComponentLayout';

/** Existing Page Builder component instances control platform layout.
 * Secure administration controls remain passed as React children: untrusted
 * registered components cannot gain access to privileged callbacks or data.
 */
export function eligibleSystemPage(page:LightningPageMetadata|undefined,workspace:string,permission:string){
 if(!page||page.apiName!==systemPageApiName(workspace)||page.status!=='Active'
   ||page.scope!=='platform-system'||page.ownerNamespace!=='MetaDrive'
   ||page.overridePolicy!=='presentation-only'||!page.requiredPermissions?.includes(permission)
   ||page.pageType!=='App Page'||page.layoutMode!=='free-canvas')return false;
 return page.components.some(c=>c.type==='Custom:SystemPanel'
   &&c.properties.systemWorkspaceId===workspace
   &&c.properties.requiredPermission===permission
   &&c.visible!==false);
}
function positionStyle(item:PageComponentMetadata,page:LightningPageMetadata):React.CSSProperties{
 const base=resolvePageComponentStyle(item.properties,item.type);
 const p=item.position;
 if(!p)return base;
 const valid=[p.x,p.y,p.width,p.height].every(n=>Number.isFinite(n)&&n>=0);
 if(!valid||p.width<1||p.height<1||p.x+p.width>page.canvasWidth||p.y+p.height>page.canvasHeight)return base;
 // Reuse the same saved canvas geometry, but keep secure administration forms
 // in normal document flow so tall editors and mobile layouts never overlap.
 return {...base,maxWidth:'100%',
  width:(100*p.width/page.canvasWidth)+'%',
  marginLeft:(100*p.x/page.canvasWidth)+'%'};
}
export default function PlatformSystemPageRenderer({page,workspace,permission,components,children}:{
 page:LightningPageMetadata;workspace:string;permission:string;
 components:readonly LibraryComponentMetadata[];children:ReactNode;
}){
 if(!eligibleSystemPage(page,workspace,permission))return <>{children}</>;
 const contentSlot=page.components.find(item=>item.type==='Custom:SystemPanel'
  && item.properties.systemWorkspaceId===workspace
  && item.properties.requiredPermission===permission&&item.visible!==false);
 return <div className="platform-system-page-layout" style={{display:'flex',flexDirection:'column',gap:12,maxWidth:page.canvasWidth}}>
 {page.components.filter(item=>item.visible!==false&&!item.properties.platformSlotKey)
  .sort((a,b)=>(a.position?.y??0)-(b.position?.y??0)||(a.position?.x??0)-(b.position?.x??0))
  .map(item=>{
  const style=positionStyle(item,page);
  if(item.type==='Custom:SystemPanel'&&item.properties.systemWorkspaceId===workspace){
   if(item.id!==contentSlot?.id||item.properties.requiredPermission!==permission)return null;
   return <section key={item.id} aria-label={item.label} style={style} data-page-instance={item.id}>
    <PlatformPageSlotsProvider page={page}>{children}</PlatformPageSlotsProvider>
   </section>;
  }
  if(item.type==='Rich Text'){
   const text=typeof item.properties.text==='string'?item.properties.text:item.label;
   return <div key={item.id} style={style} data-page-instance={item.id}>{text}</div>;
  }
  if(item.type.startsWith('Custom:')){
   const apiName=item.type.slice('Custom:'.length);
   const definition=findRegisteredComponent(components,apiName,'platform');
   return definition?<div key={item.id} style={style} data-page-instance={item.id}>
    <RegisteredComponent definition={definition} props={item.properties}/>
   </div>:null;
  }
  return null;
 })}
 </div>;
}
