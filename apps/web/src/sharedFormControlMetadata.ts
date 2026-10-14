import {validateComponentPropertyName,type ComponentPropertyValues} from './componentProperties';
/** 3c form control metadata adapter for the existing registered component host.
 * Does not render another form system or bypass field-level server RBAC.
 */
export type SharedFormControlKind='text'|'number'|'checkbox'|'select'|'textarea';
export type SharedFormControl={name:string;kind:SharedFormControlKind;label:string;required?:boolean;readOnly?:boolean;options?:readonly {label:string;value:string}[]};
export function validateSharedFormControls(controls:readonly SharedFormControl[]):string[]{
 const errors:string[]=[];const seen:ComponentPropertyValues=Object.create(null);
 for(const field of controls){
  const nameError=validateComponentPropertyName(field.name,seen);
  if(nameError){errors.push(field.name+': '+nameError);continue;}
  seen[field.name]=true;
  if(!['text','number','checkbox','select','textarea'].includes(field.kind))errors.push(field.name+': Invalid control');
  if(typeof field.label!=='string'||!field.label.trim())errors.push(field.name+': Accessible label required');
  if(field.kind==='select'){
   if(!Array.isArray(field.options)||!field.options.length)errors.push(field.name+': Options required');
   else if(field.options.some(o=>!o||typeof o.label!=='string'||!o.label.trim()||typeof o.value!=='string')
    ||new Set(field.options.map(o=>o.value)).size!==field.options.length)errors.push(field.name+': Invalid options');
  }else if(field.options!==undefined)errors.push(field.name+': Options only apply to select');
 }
 return errors;
}
export function normalizeSharedFormValues(controls:readonly SharedFormControl[],saved:Readonly<Record<string,unknown>>):
 {values:ComponentPropertyValues;errors:string[]}{
 const errors=validateSharedFormControls(controls);
 const values:ComponentPropertyValues={};
 if(errors.length)return {values,errors};
 for(const field of controls){
  const value=saved[field.name];
  if(value===undefined||value===null||value===''){
   if(field.required)errors.push(field.name+': Required');
   if(value===null||value==='')values[field.name]=value;
   continue;
  }
  const valid=field.kind==='checkbox'?typeof value==='boolean'
   :field.kind==='number'?typeof value==='number'&&Number.isFinite(value)
   :typeof value==='string'&&(field.kind!=='select'||field.options!.some(o=>o.value===value));
  if(!valid)errors.push(field.name+': Invalid value');
  else values[field.name]=value;
 }
 return {values,errors};
}
