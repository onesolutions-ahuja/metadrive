import {resolvePageComponentStyle,type LayoutDevice} from './pageComponentLayout';
/** 3f uses existing per-device appearance and visibility metadata. */
export type SharedResponsiveMetadata={type:string;properties:Record<string,unknown>;visible?:boolean};
export function resolveSharedResponsive(instance:SharedResponsiveMetadata,device:LayoutDevice){
 const style=resolvePageComponentStyle(instance.properties,instance.type,device);
 const hidden=instance.visible===false||style.display==='none'||style.visibility==='hidden';
 return {style,hidden,editorVisible:true};
}
