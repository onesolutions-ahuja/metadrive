import {componentVisualStyle,isLayoutType,type LayoutDevice} from './pageComponentLayout';

/** 3b reuses MetaDrive's existing layout visual resolver and responsive settings.
 * This is a metadata adapter, not an alternative renderer.
 */
export type SharedLayoutKind='Container'|'Row'|'Column'|'Card'|'Grid';
export type SharedLayoutDefinition={
  kind:SharedLayoutKind;
  visualStyle?:unknown;
  layoutContainer?:boolean;
  slotNames?:readonly string[];
};
const slotName=/^[A-Za-z][A-Za-z0-9_]*$/;
export function validateSharedLayout(definition:SharedLayoutDefinition):string[]{
  const errors:string[]=[];
  if(!isLayoutType(definition.kind))errors.push('Unsupported layout kind');
  if(definition.layoutContainer!==undefined&&definition.layoutContainer!==true)
    errors.push('Layout container flag must be true');
  if(definition.slotNames!==undefined){
    if(!Array.isArray(definition.slotNames))errors.push('Slots must be a list');
    else {
      const seen=new Set<string>();
      for(const slot of definition.slotNames){
        if(typeof slot!=='string'||!slotName.test(slot)||seen.has(slot))errors.push('Invalid or duplicate layout slot');
        seen.add(slot);
      }
    }
  }
  return errors;
}
export function sharedLayoutStyle(definition:SharedLayoutDefinition,device:LayoutDevice='Desktop'){
  const errors=validateSharedLayout(definition);
  if(errors.length)throw Error(errors.join('; '));
  return componentVisualStyle(definition.visualStyle,definition.kind,device);
}
