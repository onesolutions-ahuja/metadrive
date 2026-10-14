import type {LibraryComponentMetadata} from './metadata';
import {findRegisteredComponent,type ComponentSurface} from './componentRegistryLookup';
/** 3g: keep existing published registry and central RBAC as authority. */
export type SharedComponentRequirement={apiName:string;surface:ComponentSurface};
export function auditSharedComponentRegistry(
 requirements:readonly SharedComponentRequirement[],
 available:readonly LibraryComponentMetadata[],
 granted:ReadonlySet<string>
):string[]{
 const errors:string[]=[];
 for(const requirement of requirements){
  if(!granted.has(requirement.apiName)){errors.push('Access denied: '+requirement.apiName);continue;}
  if(!findRegisteredComponent(available,requirement.apiName,requirement.surface))
   errors.push('Unavailable published component: '+requirement.apiName);
 }
 return errors;
}
