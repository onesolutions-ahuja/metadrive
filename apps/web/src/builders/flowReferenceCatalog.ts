import type { FieldMetadata, FlowDefinitionMetadata, ObjectMetadata } from '../metadata';

export type FlowReferenceChoice = {
  reference: string;
  label: string;
  detail: string;
  category: 'Earlier steps' | 'Flow inputs and variables' | 'Trigger record';
  dataType: string;
  targetObject?: string;
};
const specialFields = [{apiName:'Id',label:'Record ID',dataType:'Id'},
  {apiName:'CreatedDate',label:'Created Date',dataType:'DateTime'}];

/** A node's output can only be suggested if every route to the current node passes through it. */
export function precedingFlowSteps(flow: FlowDefinitionMetadata, elementId: number): Set<number> {
  const ids = new Set(flow.elements.map(item => item.id));
  const start = flow.elements.find(item => item.type === 'Start')?.id;
  if (start === undefined || !ids.has(elementId)) return new Set();
  const incoming = new Map<number, number[]>();
  const outgoing = new Map<number, number[]>();
  for (const edge of flow.connectors) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    incoming.set(edge.to,[...(incoming.get(edge.to) ?? []),edge.from]);
    outgoing.set(edge.from,[...(outgoing.get(edge.from) ?? []),edge.to]);
  }
  const reachable = new Set<number>([start]);
  const queue=[start];
  while(queue.length){for(const id of outgoing.get(queue.shift()!) ?? [])if(!reachable.has(id)){reachable.add(id);queue.push(id)}}
  if(!reachable.has(elementId))return new Set();
  const dominant = new Map<number,Set<number>>();
  for(const id of reachable)dominant.set(id,id===start?new Set([start]):new Set(reachable));
  let changed=true;
  while(changed){
    changed=false;
    for(const id of reachable){
      if(id===start)continue;
      const preds=(incoming.get(id) ?? []).filter(parent=>reachable.has(parent));
      if(!preds.length)continue;
      const common=new Set(dominant.get(preds[0]));
      for(const pred of preds.slice(1))for(const x of common)if(!dominant.get(pred)?.has(x))common.delete(x);
      common.add(id);
      const before=dominant.get(id)!;
      if(common.size!==before.size||[...common].some(x=>!before.has(x))){dominant.set(id,common);changed=true}
    }
  }
  const earlier=dominant.get(elementId) ?? new Set<number>();
  earlier.delete(elementId);
  return earlier;
}

function primitiveType(type:string): string {
  if(type.startsWith('Lookup(')||type.startsWith('Master-Detail('))return 'lookup';
  if(/^(Number|Currency|Percent)(\(|$)/i.test(type))return 'number';
  if(/^(Checkbox|Boolean)$/i.test(type))return 'boolean';
  if(type==='Date'||type==='DateTime'||type==='Date/Time')return type;
  if(type==='Id')return 'id';
  return 'text';
}

/** Limit selectable sources to compatible, existing typed metadata. */
export function compatibleFlowValue(source:Pick<FlowReferenceChoice,'dataType'|'targetObject'>,target?:FieldMetadata):boolean {
  if(!target)return true;
  const need=primitiveType(target.dataType);
  const got=primitiveType(source.dataType);
  if(need==='lookup')return (got==='id'||got==='lookup') && Boolean(target.relationship?.targetObject)
    && (!source.targetObject || target.relationship?.targetObject===source.targetObject)
    && (got!=='lookup'||Boolean(source.targetObject));
  if(need==='id')return got==='id';
  if(need==='number'||need==='boolean')return got===need;
  if(need==='Date'||need==='DateTime'||need==='Date/Time')return need===got;
  return got==='text'||got==='id';
}

export function flowReferenceChoices(flow:FlowDefinitionMetadata,elementId:number,objects:readonly ObjectMetadata[],target?:FieldMetadata):FlowReferenceChoice[]{
  const result:FlowReferenceChoice[]=[];
  const recordChoices=(root:string,label:string,objectName:string,category:FlowReferenceChoice['category'])=>{
    const obj=objects.find(item=>item.apiName===objectName);
    if(!obj)return;
    const fields=[...specialFields,...obj.fields.filter(field=>!specialFields.some(s=>s.apiName===field.apiName))];
    for(const field of fields){
      const linkedObject=obj.fields.find(candidate=>candidate.apiName===field.apiName)?.relationship?.targetObject;
      const choice:FlowReferenceChoice={reference:`{!${root}.${field.apiName}}`,label:label+' → '+field.label,
        detail:root+'.'+field.apiName+' · '+obj.label,category,dataType:field.dataType,
        ...(field.apiName==='Id'?{targetObject:objectName}
          :linkedObject?{targetObject:linkedObject}:{})};
      if(compatibleFlowValue(choice,target))result.push(choice);
    }
  };
  if(flow.triggerObject && ['Record-Triggered Flow','Schedule-Triggered Flow'].includes(flow.flowType))
    recordChoices('$Record','Trigger record',flow.triggerObject,'Trigger record');
  for(const resource of flow.resources){
    if(resource.type==='Record'){
      if(resource.availableForInput)recordChoices(resource.name,resource.label,resource.dataType,'Flow inputs and variables');
    }else if(resource.type!=='Record Collection'){
      const choice:FlowReferenceChoice={reference:`{!${resource.name}}`,label:resource.label,
        detail:resource.name+' · '+resource.dataType,category:'Flow inputs and variables',dataType:resource.dataType};
      if(compatibleFlowValue(choice,target))result.push(choice);
    }
  }
  const earlier=precedingFlowSteps(flow,elementId);
  const resourceNames=new Set(flow.resources.map(resource=>resource.name));
  const screenFields=(element:FlowDefinitionMetadata['elements'][number])=>{
    const fields=Array.isArray(element.config.fields)?element.config.fields:[];
    for(const field of fields){
      if(!field||typeof field!=='object'||Array.isArray(field))continue;
      const item=field as Record<string,unknown>;
      const name=typeof item.apiName==='string'?item.apiName
        :String(item.label??'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'');
      if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)||resourceNames.has(name))continue;
      const type=String(item.type??'Text');
      if(['Display Text','Display Image','Section','Address','Name','Data Table',
        'File Upload','Repeater','Custom Component','Multi-Select Picklist'].includes(type)
        ||(type==='Choice Lookup'&&item.multipleSelections===true))continue;
      const lookup=type==='Lookup'||type==='Choice Lookup';
      const targetObject=lookup?String(item.objectApiName??''):undefined;
      if(lookup&&!objects.some(object=>object.apiName===targetObject))continue;
      const choice:FlowReferenceChoice={
        reference:`{!${name}}`,label:element.label+' → '+String(item.label||name),
        detail:name+' · '+(lookup?'Record ID ('+targetObject+')':type)+' · Screen input',
        category:'Earlier steps',dataType:lookup?'Id':type,
        ...(targetObject?{targetObject}:{})
      };
      if(compatibleFlowValue(choice,target))result.push(choice);
    }
  };
  for(const element of flow.elements){
    if(!earlier.has(element.id))continue;
    if(element.type==='Screen')screenFields(element);
    if(element.type==='Get Records'){
      const name=String(element.config.outputVariable||`element${element.id}`);
      const type=String(element.config.object||'');
      const limit=String(element.config.recordLimit||'1');
      if(limit==='1')recordChoices(name,element.label,type,'Earlier steps');
    }
    if(element.type==='Create Records' && element.config.recordSource!=='collection')
      recordChoices(`record${element.id}`,element.label,String(element.config.object||''),'Earlier steps');
    if(element.type==='Loop'){
      const name=String(element.config.loopVariable||'');
      const record=flow.resources.find(resource=>resource.name===name&&resource.type==='Record');
      if(record)recordChoices(name,record.label,record.dataType,'Earlier steps');
    }
  }
  const unique=new Map<string,FlowReferenceChoice>();
  for(const choice of result)unique.set(choice.reference,choice);
  return [...unique.values()];
}

export const flowReferencePattern=/^\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}$/;
export function referenceName(value:unknown):string|undefined {
  return typeof value==='string'?flowReferencePattern.exec(value.trim())?.[1]:undefined;
}
