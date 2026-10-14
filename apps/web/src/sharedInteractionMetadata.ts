import {resolvePageActionRoute,type PageActionRoutingContext} from './pageActionRouting';
/** 3e: metadata only; the existing host handles navigation, focus and ARIA. */
export type SharedInteraction={kind:'navigation'|'dialog'|'feedback';label:string;eventName:string;target?:Record<string,unknown>;message?:string};
export function resolveSharedInteraction(item:SharedInteraction,context:PageActionRoutingContext){
 if(!item.label?.trim()||!/^[A-Za-z][A-Za-z0-9_]*$/.test(item.eventName))throw Error('Accessible label and registered event required');
 if(item.kind==='navigation')return {kind:'navigation' as const,route:resolvePageActionRoute(item.target??{},context)};
 if(item.kind==='dialog')return {kind:'dialog' as const,accessibleName:item.label,restoreFocus:true,modal:true};
 if(item.kind==='feedback'&&typeof item.message==='string'&&item.message.length<=1000)
  return {kind:'feedback' as const,role:'status' as const,message:item.message};
 throw Error('Unsupported interaction');
}
