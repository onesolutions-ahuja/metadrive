import {workspaces} from './metadata';
import {validateComponentPropertyName} from './componentProperties';
import type {LayoutDevice} from './pageComponentLayout';

/** The single builder contract reuses registered workspace routes and existing
 * authoring engines. Server authorisation remains mandatory for every write.
 */
export const builderDefinitions=[
 {id:'page-builder',kind:'page',capability:'metadata:write'},
 {id:'flow-builder',kind:'flow',capability:'metadata:write'},
 {id:'dashboard-builder',kind:'dashboard',capability:'metadata:write'},
 {id:'report-builder',kind:'report',capability:'metadata:write'},
 {id:'component-library',kind:'component',capability:'metadata:write'},
 {id:'object-manager',kind:'schema',capability:'metadata:write'}
] as const;
export type BuilderId=typeof builderDefinitions[number]['id'];
export type BuilderEditorContext={workspaceId:string;tenantId:string;userId:string;grants:ReadonlySet<string>;device:LayoutDevice};
export function resolveBuilderContext(context:BuilderEditorContext){
 const definition=builderDefinitions.find(x=>x.id===context.workspaceId);
 if(!definition||!workspaces.some(x=>x.id===definition.id))throw Error('Builder not registered');
 if(!context.tenantId.trim()||!context.userId.trim())throw Error('Authenticated tenant context required');
 if(!context.grants.has(definition.capability))throw Error('Builder permission denied');
 return {definition,device:context.device,canEdit:true};
}
export type InspectorProperty={apiName:string;kind:'text'|'number'|'boolean';value:unknown;readOnly?:boolean};
export function validateInspectorProperties(properties:readonly InspectorProperty[]){
 const errors:string[]=[];const names:Record<string,unknown>={};
 for(const item of properties){
  const error=validateComponentPropertyName(item.apiName,names);
  if(error)errors.push(item.apiName+': '+error);
  else names[item.apiName]=true;
  if(item.kind==='text'&&typeof item.value!=='string')errors.push(item.apiName+': Expected text');
  if(item.kind==='number'&&(typeof item.value!=='number'||!Number.isFinite(item.value)))errors.push(item.apiName+': Expected finite number');
  if(item.kind==='boolean'&&typeof item.value!=='boolean')errors.push(item.apiName+': Expected boolean');
 }
 return errors;
}
export type SystemDefinition={apiName:string;revision:number;status:'Draft'|'Published';body:Record<string,unknown>};
export function prepareBuilderPublish(current:SystemDefinition,next:SystemDefinition,grants:ReadonlySet<string>){
 if(!grants.has('metadata:write'))throw Error('Publish permission denied');
 if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(next.apiName)||current.apiName!==next.apiName)throw Error('Invalid definition identity');
 if(!Number.isSafeInteger(next.revision)||next.revision!==current.revision+1)throw Error('Stale or invalid metadata revision');
 if(current.status!=='Draft'||next.status!=='Published')throw Error('Publish requires a draft');
 if(!next.body||typeof next.body!=='object'||Array.isArray(next.body))throw Error('Invalid metadata document');
 return Object.freeze({apiName:next.apiName,previousRevision:current.revision,revision:next.revision,body:structuredClone(next.body)});
}
export function prepareBuilderRollback(published:SystemDefinition,previous:SystemDefinition,grants:ReadonlySet<string>){
 if(!grants.has('metadata:write'))throw Error('Rollback permission denied');
 if(published.status!=='Published'||published.apiName!==previous.apiName||published.revision<=previous.revision)
  throw Error('Rollback version mismatch');
 return {apiName:published.apiName,expectedRevision:published.revision,restoreRevision:previous.revision,body:structuredClone(previous.body)};
}
