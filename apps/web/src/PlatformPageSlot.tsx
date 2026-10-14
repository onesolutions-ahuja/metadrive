import React,{createContext,useContext,type ReactNode} from 'react';
import type {LightningPageMetadata} from './metadata';
import {resolvePageComponentStyle} from './pageComponentLayout';

/** A protected administration control may opt into a Page Builder instance.
 * The slot is presentation-only: existing server-authorised operations and
 * event handlers remain in the owning admin screen.
 */
const context=createContext<LightningPageMetadata|null>(null);
export function PlatformPageSlotsProvider({page,children}:{
 page:LightningPageMetadata;children:ReactNode;
}){
 return <context.Provider value={page}>{children}</context.Provider>;
}
export function PlatformPageSlot({slotKey,children}:{
 slotKey:string;children:ReactNode;
}){
 const page=useContext(context);
 if(!page)return <>{children}</>;
 const instance=page.components.find(item=>item.properties.platformSlotKey===slotKey);
 if(!instance)return <>{children}</>;
 if(instance.visible===false)return null;
 const computed=resolvePageComponentStyle(instance.properties,instance.type);
 const style=Object.keys(computed).length?computed:{display:'contents' as const};
 return <div data-page-instance={instance.id} data-platform-slot={slotKey}
  aria-label={instance.label} style={style}>{children}</div>;
}
