/** Phase 2e: validate metadata before dispatch to the existing authorised Flow runtime.
 * This module never executes a Flow, calls an endpoint, or grants permissions.
 */
export type ComponentEventInput = string | number | boolean | null;
export type ComponentEventBinding = {
  eventName:string;
  flowApiName:string;
  typedInputs?:Readonly<Record<string,'text'|'number'|'boolean'>>;
  faultPath?:string;
};
const apiName=/^[A-Za-z][A-Za-z0-9_]*$/;
const own=(object:object,key:string)=>Object.prototype.hasOwnProperty.call(object,key);
export function validateComponentEventBinding(
  binding:ComponentEventBinding, allowedEvents:ReadonlySet<string>,
  activeFlowNames:ReadonlySet<string>
):string[]{
  const errors:string[]=[];
  if(!apiName.test(binding.eventName)||!allowedEvents.has(binding.eventName))
    errors.push('Event is not registered.');
  if(!apiName.test(binding.flowApiName)||!activeFlowNames.has(binding.flowApiName))
    errors.push('Flow is not active or available.');
  if(binding.faultPath!==undefined&&!apiName.test(binding.faultPath))
    errors.push('Invalid fault path.');
  if(binding.typedInputs!==undefined){
    if(!binding.typedInputs||typeof binding.typedInputs!=='object'||Array.isArray(binding.typedInputs))
      errors.push('Invalid input definitions.');
    else for(const [name,kind] of Object.entries(binding.typedInputs)){
      if(!apiName.test(name)||!['text','number','boolean'].includes(kind))
        errors.push('Invalid input definition: '+name);
    }
  }
  return errors;
}
/** Builds a serialisable input payload only for validated metadata.
 * Actual run permission and Flow input signatures MUST be checked by the server.
 */
export function prepareComponentEventInvocation(
  binding:ComponentEventBinding, emittedInputs:Readonly<Record<string,unknown>>,
  allowedEvents:ReadonlySet<string>,activeFlowNames:ReadonlySet<string>
):{flowApiName:string;inputs:Record<string,ComponentEventInput>;faultPath?:string}|undefined{
  if(validateComponentEventBinding(binding,allowedEvents,activeFlowNames).length)return undefined;
  const inputs:Record<string,ComponentEventInput>=Object.create(null);
  const declared=binding.typedInputs??{};
  for(const [name,kind] of Object.entries(declared)){
    if(!own(emittedInputs,name))continue;
    const value=emittedInputs[name];
    if(value!==null && !(kind==='text'&&typeof value==='string')
      && !(kind==='number'&&typeof value==='number'&&Number.isFinite(value))
      && !(kind==='boolean'&&typeof value==='boolean'))return undefined;
    inputs[name]=value as ComponentEventInput;
  }
  return {flowApiName:binding.flowApiName,inputs,...(binding.faultPath?{faultPath:binding.faultPath}:{})};
}
