import { compareMetadataValue } from '../../metadata/Definitions/metadataValueComparison';
import type { FieldMetadata } from '../../metadata/Definitions/metadata';
import { examineRecordFilter } from '../../records/RecordWorkspace/recordFilterMetadata';

/**
 * The Page Builder supplies event bindings to the existing platform Flow/Action
 * runtime. A component need not select an Object merely to emit an action.
 * Never execute user-supplied expressions or attach business logic to JSX.
 */
export function needsMetadataComponentRuntime(properties: Record<string, unknown>): boolean {
  // Any registered component can bind to an Object, not just a named business
  // vertical. Keep legacy *ObjectApiName properties working without per-app code.
  if (Object.entries(properties).some(([key, value]) =>
    /objectApiName$/i.test(key) && typeof value === 'string' && value.trim().length > 0)) return true;
  // Explicit record-field bindings also need the data runtime even while the
  // Object binding is missing, so the editor exposes a configuration error
  // instead of silently rendering an empty static grid.
  if (Object.entries(properties).some(([key, value]) =>
    /(?:name|title|price|image|category|vatApplicable|ageRestricted)FieldApiName$/i.test(key) &&
    typeof value === 'string' && value.trim().length > 0)) return true;
  // Field mentions require the same permission-gated data runtime as Object bindings.
  if (Object.values(properties).some(value => typeof value === 'string'
    && /(^|[^A-Za-z0-9_@])@[A-Za-z][A-Za-z0-9_]*\.[A-Za-z]/.test(value))) return true;
  const bindings = properties.actionFlows;
  return Boolean(bindings && typeof bindings === 'object' && !Array.isArray(bindings)
    && Object.keys(bindings).length > 0);
}

/**
 * Evaluate the Page Builder's existing record-filter contract against
 * permission-checked records. Invalid, missing or unreadable fields fail closed;
 * an empty/unset filter is intentionally equivalent to "all readable records".
 */
/** Resolve safe component properties from declared Flow outputs → page-state keys.
 * Record collections are allowed only as explicit list bindings; they stay
 * page-local and the originating Flow must be server-authorised. A Flow never
 * acquires permission merely because its output is displayed here. */
export function safePageStateRecordCollection(value:unknown):Record<string,unknown>[]|undefined {
  let candidate=value;
  if(typeof candidate==='string'){
    if(candidate.length>500000)return undefined;
    try{candidate=JSON.parse(candidate);}catch{return undefined;}
  }
  if(!Array.isArray(candidate)||candidate.length>200)return undefined;
  let size=0;
  const valid=(item:unknown,depth:number):boolean=>{
    if(depth>3)return false;
    if(item===null)return true;
    if(typeof item==='string'){size+=item.length;return item.length<=20000&&size<=500000;}
    if(typeof item==='boolean')return true;
    if(typeof item==='number')return Number.isFinite(item);
    if(Array.isArray(item))return item.length<=100&&item.every(v=>valid(v,depth+1));
    if(item&&typeof item==='object'&&Object.getPrototypeOf(item)===Object.prototype)
      return Object.keys(item).length<=100&&Object.entries(item).every(([k,v])=>
        /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(k)&&
        !['__proto__','prototype','constructor'].includes(k)&&valid(v,depth+1));
    return false;
  };
  return candidate.every(item=>item&&typeof item==='object'&&!Array.isArray(item)&&valid(item,0))
    ?candidate as Record<string,unknown>[]
    :undefined;
}

export function bindPageStateProperties<T extends Record<string,unknown>>(
  properties:T,state:Readonly<Record<string,unknown>>
):T {
  const raw=properties.stateBindings;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return properties;
  const bindings=raw as Record<string,unknown>;
  const next:Record<string,unknown>={...properties};
  const protectedKeys=new Set(['objectApiName','actionFlows','stateBindings','filters',
    'records','onAction','onChange','sessionId','key','ref','children']);
  for(const [target,key] of Object.entries(bindings)){
    if(!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(target)||protectedKeys.has(target)
      ||typeof key!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key))continue;
    const value=state[key];
    if(value===null||['string','number','boolean'].includes(typeof value))
      next[target]=value;
    else if(Array.isArray(value)){
      const records=safePageStateRecordCollection(value);
      if(records)next[target]=records;
    }
  }
  return next as T;
}
export type PageFilterContext={
  pageState?:Readonly<Record<string,unknown>>;
  recordId?:string;
  sessionId?:string;
};
type PageFilter={field:string;operator:string;value:unknown};
export type PageQueryFilter={field:string;value:string;related:boolean};
const isDynamic=(value:unknown):value is {source:string;key?:string}=>
  Boolean(value&&typeof value==='object'&&!Array.isArray(value));
/** Resolve only declared, typed page context sources; never evaluate expressions. */
export function resolvePageFilterValue(value:unknown,context:PageFilterContext):unknown {
  if (!isDynamic(value)) return value;
  if(value.source==='PageState' && typeof value.key==='string'
    && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value.key)){
    const resolved=context.pageState?.[value.key];
    return resolved===null||['string','number','boolean'].includes(typeof resolved)?resolved:undefined;
  }
  if(value.source==='CurrentRecord')return context.recordId||undefined;
  if(value.source==='Session')return context.sessionId||undefined;
  return undefined;
}
/** Block unbound parent filters *before* querying; missing context never means "all records". */
export function pageComponentRecordQuery(
  definitions:unknown,fields:ReadonlyArray<FieldMetadata>,context:PageFilterContext={}
):{blocked:boolean;filter?:PageQueryFilter}{
  if(definitions===undefined||definitions===null)return {blocked:false};
  if(!Array.isArray(definitions))return {blocked:true};
  let first:PageQueryFilter|undefined;
  for(const value of definitions){
    if(examineRecordFilter(value,fields)!==null)return {blocked:true};
    const filter=value as PageFilter;
    const resolved=resolvePageFilterValue(filter.value,context);
    if(isDynamic(filter.value)&&(resolved===undefined||resolved===null||resolved===''))
      return {blocked:true};
    if(isDynamic(filter.value)&&filter.operator==='Equals'&&!first
      &&['string','number','boolean'].includes(typeof resolved)){
      const field=fields.find(candidate=>candidate.apiName===filter.field);
      first={field:filter.field,value:String(resolved),related:Boolean(field?.relationship)};
    }
  }
  return {blocked:false,filter:first};
}
export function filterPageComponentRecords<T extends Record<string, unknown>>(
  records: readonly T[],
  definitions: unknown,
  fields: ReadonlyArray<FieldMetadata>,
  context: PageFilterContext={}
): T[] {
  if (definitions === undefined || definitions === null) return [...records];
  if (!Array.isArray(definitions)) return [];
  if (pageComponentRecordQuery(definitions,fields,context).blocked)return [];
  return records.filter(record => definitions.every(item => {
    const filter = item as PageFilter;
    const resolved=resolvePageFilterValue(filter.value,context);
    if (!Object.prototype.hasOwnProperty.call(record, filter.field)) return false;
    return compareMetadataValue(record[filter.field], filter.operator, resolved, true);
  }));
}
