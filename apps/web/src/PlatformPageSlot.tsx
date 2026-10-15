import React,{createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import type {LightningPageMetadata,LibraryComponentMetadata} from './metadata';
import {findRegisteredComponent} from './componentRegistryLookup';
import RegisteredComponent from './RegisteredComponent';
import {resolvePageComponentStyle} from './pageComponentLayout';

/** A protected administration control may opt into a Page Builder instance.
 * The slot is presentation-only: existing server-authorised operations and
 * event handlers remain in the owning admin screen.
 */
type PlatformSlotDevice='Desktop'|'Tablet'|'Phone';
const context=createContext<{page:LightningPageMetadata;device:PlatformSlotDevice;libraryComponents:readonly LibraryComponentMetadata[]}|null>(null);
function viewportDevice():PlatformSlotDevice{
 if(typeof window==='undefined')return 'Desktop';
 return window.innerWidth<640?'Phone':window.innerWidth<1024?'Tablet':'Desktop';
}
export function PlatformPageSlotsProvider({page,children,libraryComponents=[]}:{
 page:LightningPageMetadata;children:ReactNode;libraryComponents?:readonly LibraryComponentMetadata[];
}){
 const [device,setDevice]=useState<PlatformSlotDevice>('Desktop');
 useEffect(()=>{const update=()=>setDevice(viewportDevice());update();
  window.addEventListener('resize',update);
  return ()=>window.removeEventListener('resize',update);
 },[]);
 return <context.Provider value={{page,device,libraryComponents}}>{children}</context.Provider>;
}
/** Resolve editable presentation properties from the already-authorized active system page.
 * Only non-executable presentation values are exposed; validation, writes and RBAC
 * remain owned by the original control and OneEngine API.
 */
export function usePlatformSlotPresentation(slotKey:string){
 const state=useContext(context);
 const instance=state?.page.components.find(item=>
  item.properties.platformSlotKey===slotKey && item.visible!==false);
 if(!instance)return {};
 const properties=instance.properties as Record<string,unknown>;
 return {
  label:typeof properties.controlLabel==='string' ? properties.controlLabel : undefined,
  placeholder:typeof properties.controlPlaceholder==='string' ? properties.controlPlaceholder : undefined,
  helpText:typeof properties.controlHelpText==='string' ? properties.controlHelpText : undefined,
  description:typeof properties.controlDescription==='string' ? properties.controlDescription : undefined
 };
}
/** Use a published trusted registry component only: no tenant-authored code receives privileged event handlers. */
export function useRegisteredAdminField(){
 const state=useContext(context);
 const definition=state?findRegisteredComponent(state.libraryComponents,'AdminField','page'):undefined;
 return definition?.trustedBundled===true&&definition.status!=='Draft'?definition:undefined;
}
export function PlatformPageSlot({slotKey,children}:{
 slotKey:string;children:ReactNode;
}){
 const state=useContext(context);
 if(!state)return <>{children}</>;
 const instance=state.page.components.find(item=>item.properties.platformSlotKey===slotKey);
 if(!instance)return <>{children}</>;
 if(instance.visible===false)return null;
 const computed=resolvePageComponentStyle(instance.properties,instance.type,state.device);
 const style=Object.keys(computed).length?computed:{display:'contents' as const};
 const panel=instance.type==='Custom:SystemPanel'
  ?findRegisteredComponent(state.libraryComponents,'SystemPanel','page'):undefined;
 // Only the trusted bundled, published panel may host live privileged controls.
 // Existing operations still use the originating OneEngine-authorised handlers.
 const content=panel?.trustedBundled===true
  ?<RegisteredComponent definition={panel} props={{...instance.properties,children}} layoutTransparent/>:children;
 return <div data-page-instance={instance.id} data-platform-slot={slotKey}
  aria-label={typeof instance.properties.controlLabel==='string' && instance.properties.controlLabel ? instance.properties.controlLabel : instance.label} style={style}>{content}</div>;
}
