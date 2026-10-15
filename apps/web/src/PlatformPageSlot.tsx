import React,{createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import type {LightningPageMetadata} from './metadata';
import {resolvePageComponentStyle} from './pageComponentLayout';

/** A protected administration control may opt into a Page Builder instance.
 * The slot is presentation-only: existing server-authorised operations and
 * event handlers remain in the owning admin screen.
 */
type PlatformSlotDevice='Desktop'|'Tablet'|'Phone';
const context=createContext<{page:LightningPageMetadata;device:PlatformSlotDevice}|null>(null);
function viewportDevice():PlatformSlotDevice{
 if(typeof window==='undefined')return 'Desktop';
 return window.innerWidth<640?'Phone':window.innerWidth<1024?'Tablet':'Desktop';
}
export function PlatformPageSlotsProvider({page,children}:{
 page:LightningPageMetadata;children:ReactNode;
}){
 const [device,setDevice]=useState<PlatformSlotDevice>('Desktop');
 useEffect(()=>{const update=()=>setDevice(viewportDevice());update();
  window.addEventListener('resize',update);
  return ()=>window.removeEventListener('resize',update);
 },[]);
 return <context.Provider value={{page,device}}>{children}</context.Provider>;
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
 return <div data-page-instance={instance.id} data-platform-slot={slotKey}
  aria-label={instance.label} style={style}>{children}</div>;
}
