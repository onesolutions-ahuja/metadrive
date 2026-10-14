import type {FieldMetadata} from './metadata';
import {filterPageComponentRecords} from './pageComponentBindings';
/** Shared 3d list/table metadata, operating only on server-authorised rows.
 * The Object API and record-filter contract remain the authority.
 */
export type SharedListMetadata={
 columns:readonly string[];
 filters?:unknown;
 sort?:{field:string;direction:'asc'|'desc'};
 pageSize?:number;
 page?:number;
};
export function validateSharedListMetadata(definition:SharedListMetadata,fields:ReadonlyArray<FieldMetadata>):string[]{
 const errors:string[]=[];
 const allowed=new Set(fields.map(field=>field.apiName));
 if(!Array.isArray(definition.columns)||!definition.columns.length)errors.push('Columns required');
 else{
  if(new Set(definition.columns).size!==definition.columns.length)errors.push('Duplicate columns');
  for(const column of definition.columns)if(!allowed.has(column))errors.push('Unavailable column');
 }
 if(definition.sort&&(!allowed.has(definition.sort.field)||!['asc','desc'].includes(definition.sort.direction)))
  errors.push('Unavailable sort');
 if(definition.pageSize!==undefined&&(!Number.isInteger(definition.pageSize)||definition.pageSize<1||definition.pageSize>200))
  errors.push('Invalid page size');
 if(definition.page!==undefined&&(!Number.isSafeInteger(definition.page)||definition.page<0))
  errors.push('Invalid page');
 if(definition.filters!==undefined){
  if(!Array.isArray(definition.filters))errors.push('Invalid filters');
  else if(filterPageComponentRecords([{}],definition.filters,fields).length===0&&definition.filters.length){
   // Validate saved field/operator metadata independently of whether test rows match.
   for(const filter of definition.filters){
    if(examineFilter(filter,fields))errors.push('Invalid filter');
   }
  }
 }
 return errors;
}
import {examineRecordFilter as examineFilter} from './recordFilterMetadata';
export function applySharedListMetadata<T extends Record<string,unknown>>(
 rows:readonly T[],definition:SharedListMetadata,fields:ReadonlyArray<FieldMetadata>
):{rows:Record<string,unknown>[];total:number;errors:string[]}{
 const errors=validateSharedListMetadata(definition,fields);
 if(errors.length)return {rows:[],total:0,errors};
 const filtered=filterPageComponentRecords(rows,definition.filters,fields);
 const ordered=definition.sort?[...filtered].sort((a,b)=>{
  const x=a[definition.sort!.field],y=b[definition.sort!.field];
  const cmp=x===y?0:x==null?-1:y==null?1:
   typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),undefined,{numeric:true});
  return definition.sort!.direction==='desc'?-cmp:cmp;
 }):filtered;
 const limit=definition.pageSize??50,offset=(definition.page??0)*limit;
 return {rows:ordered.slice(offset,offset+limit).map(row=>
  Object.fromEntries(definition.columns.map(key=>[key,row[key]]))),total:ordered.length,errors:[]};
}
