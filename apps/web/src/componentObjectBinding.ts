import type {FieldMetadata} from './metadata';
import {filterPageComponentRecords} from './pageComponentBindings';
import {examineRecordFilter} from './recordFilterMetadata';

/** Phase 2d: validate bindings before passing already-authorised Object API records
 * to the existing page component record-filter engine. No second data API. */
export type ComponentObjectDataBinding = {
  objectApiName:string;
  fieldApiNames:readonly string[];
  filters?:readonly unknown[];
  sort?:{fieldApiName:string;direction:'asc'|'desc'};
  pagination?:{limit:number;offset:number};
};
const apiName=/^[A-Za-z][A-Za-z0-9_]*$/;
export function validateComponentObjectBinding(
  binding:ComponentObjectDataBinding,
  objectApiName:string,
  permittedFields:ReadonlyArray<Pick<FieldMetadata,'apiName'|'label'|'dataType'|'picklistValues'>>
):string[]{
  const errors:string[]=[];
  if(!apiName.test(binding.objectApiName)||binding.objectApiName!==objectApiName)
    errors.push('Object binding is unavailable.');
  if(!Array.isArray(binding.fieldApiNames)||!binding.fieldApiNames.length)
    errors.push('Select at least one readable field.');
  const allowed=new Set(permittedFields.map(field=>field.apiName));
  for(const name of binding.fieldApiNames??[])
    if(typeof name!=='string'||!allowed.has(name))errors.push('Unreadable bound field.');
  if(new Set(binding.fieldApiNames).size!==binding.fieldApiNames.length)
    errors.push('Repeated bound field.');
  if(binding.filters!==undefined){
    if(!Array.isArray(binding.filters))errors.push('Invalid filter collection.');
    else for(const filter of binding.filters) {
      const error=examineRecordFilter(filter,permittedFields);
      if(error)errors.push(error);
    }
  }
  if(binding.sort&&(!allowed.has(binding.sort.fieldApiName)
    ||!['asc','desc'].includes(binding.sort.direction)))errors.push('Invalid sort field.');
  if(binding.pagination&&(!Number.isInteger(binding.pagination.limit)
    ||binding.pagination.limit<1||binding.pagination.limit>50
    ||!Number.isInteger(binding.pagination.offset)||binding.pagination.offset<0))
    errors.push('Invalid pagination.');
  return errors;
}
/** Input rows must already have passed the existing server Object, field and row RBAC. */
export function applyComponentObjectBinding<T extends Record<string,unknown>>(
  rows:readonly T[],binding:ComponentObjectDataBinding,objectApiName:string,
  permittedFields:ReadonlyArray<FieldMetadata>
):{rows:Record<string,unknown>[];errors:string[]}{
  const errors=validateComponentObjectBinding(binding,objectApiName,permittedFields);
  if(errors.length)return {rows:[],errors};
  const filtered=filterPageComponentRecords(rows,binding.filters,permittedFields);
  const sorted=binding.sort?[...filtered].sort((a,b)=>{
    const x=a[binding.sort!.fieldApiName],y=b[binding.sort!.fieldApiName];
    return (x===y?0:x==null?-1:y==null?1:String(x).localeCompare(String(y),undefined,{numeric:true}))
      *(binding.sort!.direction==='desc'?-1:1);
  }):filtered;
  const page=binding.pagination?sorted.slice(binding.pagination.offset,binding.pagination.offset+binding.pagination.limit):sorted;
  return {rows:page.map(row=>Object.fromEntries(binding.fieldApiNames.map(name=>[name,row[name]]))),errors:[]};
}
