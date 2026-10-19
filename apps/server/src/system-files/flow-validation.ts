import type {RbacEngine} from './rbac-engine.js';
import {validateFlowResources} from './flow-formula-runtime.js';

export async function validateFlowDraft(rbac:RbacEngine|undefined,tenantId:string,userId:string,
  apiName:string,draft:unknown) {
 if(!rbac)throw new Error('Flow permissions not configured');
 await rbac.require(tenantId,userId,'FlowDefinition','manage');
 if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName))throw new Error('Invalid Flow name');
 if(!draft||typeof draft!=='object'||Array.isArray(draft))throw new Error('Invalid Flow draft');
 const data=draft as Record<string,unknown>;
 const errors:string[]=[],warnings:string[]=[];
 const startNode=Array.isArray(data.elements)
  ?data.elements.find(item=>item&&typeof item==='object'&&!Array.isArray(item)
    &&(item as Record<string,unknown>).type==='Start') as Record<string,unknown>|undefined
  :undefined;
 const startConfig=startNode?.config&&typeof startNode.config==='object'
  &&!Array.isArray(startNode.config)?startNode.config as Record<string,unknown>:{};
 const beforeSave=data.flowType==='Record-Triggered Flow'&&startConfig.runWhen==='before-save';
 if(data.apiName!==apiName)errors.push('Flow API name must match the requested definition');
 if(!['Autolaunched Flow','Screen Flow','Record-Triggered Flow'].includes(String(data.flowType)))
  errors.push('This SQL runtime supports Autolaunched Flow, Screen Flow, and after-save Record-Triggered Flow');
 errors.push(...validateFlowResources(data.resources));
 if(!Array.isArray(data.elements)||!Array.isArray(data.connectors))
  return {valid:false,errors:['Flow must contain elements and connectors'],warnings};
 const nodes=data.elements as unknown[],links=data.connectors as unknown[];
 if(nodes.length>250||links.length>500)errors.push('Flow graph exceeds allowed size');
 const ids=new Set<number>(),types=new Map<number,string>();
 for(const item of nodes){
  if(!item||typeof item!=='object'||Array.isArray(item)){errors.push('Invalid Flow element');continue;}
  const node=item as Record<string,unknown>;
  if(typeof node.id!=='number'||!Number.isSafeInteger(node.id)||ids.has(node.id)){
   errors.push('Flow element identifiers must be unique integers');continue;
  }
  ids.add(node.id);
  const type=String(node.type??'');
  types.set(node.id,type);
  if(!['Start','Assignment','Decision','Create Records','CreateRecord','HTTP Callout','End',
   'Get Records','Update Records','Delete Records','Loop','Collection Filter','Collection Sort','Transform',
  'Subflow',...(data.flowType==='Screen Flow'?['Screen']:[])].includes(type))
   errors.push('Unsupported SQL Flow element: '+type);
  if(beforeSave&&!['Start','Assignment','Decision','End'].includes(type))
  errors.push('Before-save Record-Triggered Flows support only Assignment and Decision elements');
  const config=node.config;
  if(!config||typeof config!=='object'||Array.isArray(config)){
   errors.push('Flow element needs a configuration object: '+node.id);
   continue;
  }
  const properties=config as Record<string,unknown>;
  if(type==='Assignment'){
   const variable=String(properties.variable??'');
   const target=/^\$Record\.([A-Za-z][A-Za-z0-9_]*)$/.exec(variable);
   if(variable.startsWith('$Record.')&&(!beforeSave||!target))
    errors.push('Assignments to $Record fields require a valid before-save Record-Triggered Flow target');
   if(target&&properties.operator!==undefined&&properties.operator!=='Assign')
    errors.push('Before-save $Record assignments support only the Assign operator');
  }
  if(type==='Start'&&data.flowType==='Record-Triggered Flow'){
   if(typeof properties.object!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(properties.object))
    errors.push('Record-Triggered Flow Start requires a valid Object');
   if(!['created','updated','created-or-updated','deleted'].includes(String(properties.trigger??'created-or-updated')))
    errors.push('Record-Triggered Flow trigger is invalid');
   if(properties.runWhen!=='after-save')
    if(properties.runWhen!=='before-save')
     errors.push('Record-Triggered Flow save phase is invalid');
   if(properties.runWhen==='before-save'&&properties.trigger==='deleted')
    errors.push('Before-save Record-Triggered Flows cannot run on record deletion');
   if(properties.updatedRecordBehavior!==undefined
     &&!['every-time','transition'].includes(String(properties.updatedRecordBehavior)))
    errors.push('Record-Triggered Flow update behavior is invalid');
   if(properties.entryConditions!==undefined
     &&(!Array.isArray(properties.entryConditions)||properties.entryConditions.length>50))
    errors.push('Record-Triggered Flow supports up to 50 entry conditions');
   if(properties.triggerOrder!==undefined
     &&(!Number.isSafeInteger(Number(properties.triggerOrder))
       ||Number(properties.triggerOrder)<1||Number(properties.triggerOrder)>2000))
    errors.push('Record-Triggered Flow order must be between 1 and 2000');
  }
  if(['Get Records','Update Records','Delete Records'].includes(type)
    &&typeof properties.object!=='string')errors.push(type+' requires an Object');
  if(type==='Get Records'&&properties.recordLimit!==undefined&&properties.recordLimit!=='all'
    &&(!Number.isSafeInteger(Number(properties.recordLimit))
      ||Number(properties.recordLimit)<1||Number(properties.recordLimit)>200))
   errors.push('Get Records limit must be between 1 and 200');
  if(type==='HTTP Callout'){
   if(typeof properties.namedCredentialId!=='string'
     ||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(properties.namedCredentialId))
    errors.push('HTTP Callout requires a tenant HTTPS Named Credential');
   if(properties.integrationConnectionId||properties.integrationConnectionResource
     ||properties.namedCredentialResource)
    errors.push('HTTP Callout dynamic provider bindings are not yet supported');
   if(!['GET','POST','PUT','PATCH','DELETE'].includes(String(properties.method??'GET')))
    errors.push('HTTP Callout method is not supported');
   if(typeof properties.path!=='string'||properties.path.startsWith('/')
     ||properties.path.includes('\\')||properties.path.length>2048)
    errors.push('HTTP Callout needs a safe relative path');
   if(properties.deliveryMode==='DURABLE_ASYNC'&&(properties.statusVariable
     ||properties.responseVariable||properties.responseMapping))
    errors.push('Durable async HTTP Callout cannot return response variables');
   if(properties.deliveryMode!==undefined
     &&!['SYNC','DURABLE_ASYNC'].includes(String(properties.deliveryMode)))
    errors.push('HTTP Callout delivery mode is invalid');
   if(properties.queryParameters)errors.push('HTTP Callout structured query mapping is not supported');
   if(!['FAULT_PATH','FAIL','CONTINUE'].includes(String(properties.onError??'FAIL')))
    errors.push('HTTP Callout error policy is invalid');
  }
  if(type==='Subflow'){
   if(typeof properties.flowApiName!=='string'||! /^[A-Za-z][A-Za-z0-9_]*$/.test(properties.flowApiName)
     ||properties.flowApiName===apiName)
    errors.push('Subflow requires a different Flow API name');
   for(const property of ['inputValues','outputValues']){
    const value=properties[property]??'';
    if(typeof value!=='string'||value.length>8192
      ||value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)
        .some(line=>! /^[A-Za-z][A-Za-z0-9_]*\s*=\s*[^=].{0,4095}$/.test(line)))
     errors.push('Subflow '+property+' mappings are invalid');
   }
  }
  if(type==='Screen'){
   const fields=properties.fields;
   if(!Array.isArray(fields)||fields.length>100)errors.push('Screen must declare up to 100 fields');
   else {
    const names=new Set<string>();
    for(const field of fields){
     if(!field||typeof field!=='object'||Array.isArray(field)){errors.push('Invalid Screen field');continue;}
     const name=(field as Record<string,unknown>).apiName;
     if(typeof name!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)||names.has(name))
      errors.push('Screen fields require unique safe API names');
     else names.add(name);
    }
   }
  }
 }
 if([...types.values()].filter(x=>x==='Start').length!==1)errors.push('Flow must contain exactly one Start');
 if(![...types.values()].includes('End'))errors.push('Flow must contain an End');
 const outgoing=new Map<number,number[]>();
 for(const link of links){
  if(!link||typeof link!=='object'||Array.isArray(link)){errors.push('Invalid Flow connector');continue;}
  const edge=link as Record<string,unknown>;
  if(typeof edge.from!=='number'||typeof edge.to!=='number'||!ids.has(edge.from)||!ids.has(edge.to)){
   errors.push('Flow connector references an unknown element');continue;
  }
  if(edge.kind!==undefined&&!['normal','fault'].includes(String(edge.kind)))
   errors.push('Unsupported SQL Flow connector type');
  outgoing.set(edge.from,[...(outgoing.get(edge.from)??[]),edge.to]);
 }
 const start=[...types].find(([,type])=>type==='Start')?.[0];
 if(start!==undefined){
  const visited=new Set<number>(),stack=[start];
  while(stack.length){
   const id=stack.pop()!;
   if(visited.has(id))continue;
   visited.add(id);
   stack.push(...(outgoing.get(id)??[]));
  }
  if(![...visited].some(id=>types.get(id)==='End'))errors.push('No reachable End element');
  for(const id of ids)if(!visited.has(id))warnings.push('Disconnected Flow element: '+id);
 }
 return {valid:errors.length===0,errors,warnings};
}
