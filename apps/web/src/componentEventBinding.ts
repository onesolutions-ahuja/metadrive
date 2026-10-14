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
      if(!apiName.test(name)||typeof kind!=='string'||!['text','number','boolean'].includes(kind))
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

/** Adapter for the saved Page Builder actionFlows contract. No second executor:
 * the caller retains its existing /flows/:apiName/execute dispatch and UI
 * interview launch. Typed inputs, when supplied, are checked before dispatch.
 */
export function validateConfiguredFlowEvent(
  eventName:string, flowApiName:string, typedInputs:unknown,
  values:Readonly<Record<string,unknown>>, activeFlowNames:ReadonlySet<string>
):string[] {
  if(!apiName.test(eventName))return ['Invalid component event name.'];
  if(!apiName.test(flowApiName)||!activeFlowNames.has(flowApiName))
    return ['Flow is not active or available.'];
  if(typedInputs===undefined)return [];
  if(!typedInputs||typeof typedInputs!=='object'||Array.isArray(typedInputs))
    return ['Invalid typed Flow inputs.'];
  const declaration=typedInputs as Record<string,unknown>;
  for(const [name,kind] of Object.entries(declaration)){
    if(!apiName.test(name)||!['text','number','boolean'].includes(kind))
      return ['Invalid Flow input declaration: '+name];
    if(!own(values,name))continue;
    const v=values[name];
    if(v!==null&&!((kind==='text'&&typeof v==='string')
      ||(kind==='boolean'&&typeof v==='boolean')
      ||(kind==='number'&&typeof v==='number'&&Number.isFinite(v))))
      return ['Invalid value for Flow input: '+name];
  }
  return [];
}

/** Resolve only active Flows for the existing component runtime. Existing
 * server-side Flow authorisation remains mandatory at execution time. */
export function requireActiveComponentFlow<T extends {apiName:string;status:string}>(
  eventName:string,flowApiName:string,typedInputs:unknown,
  inputs:Readonly<Record<string,unknown>>,availableFlows:readonly T[]
):T{
  const active=availableFlows.filter(flow=>flow.status==='Active');
  const errors=validateConfiguredFlowEvent(eventName,flowApiName,typedInputs,inputs,
    new Set(active.map(flow=>flow.apiName)));
  if(errors.length)throw Error(errors.join('; '));
  const flow=active.find(item=>item.apiName===flowApiName);
  if(!flow)throw Error('Choose an active Flow for the configured component event.');
  return flow;
}
