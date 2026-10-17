import type { FlowMetadata, ObjectMetadata } from '../../index.js';

type Row = Record<string, unknown>;
type Choice = { type:string; objectName?:string; origin?:number; fields?:readonly string[]; isCollection?:boolean };
const expression=/^\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}$/;
const invalidExpression=/^\{!?[A-Za-z_$]|^@[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?$/;
const specialFields=new Map([['Id','Id'],['CreatedDate','DateTime'],['LastModifiedDate','DateTime']]);
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.filter((x):x is Row=>x!==null&&typeof x==='object'&&!Array.isArray(x)):[];
const typed=(dataType:string):string=>
  /^(Lookup|Master-Detail)\(/.test(dataType)?'lookup':
  /^(Number|Currency|Percent)(\(|$)/.test(dataType)?'number':
  /^(Boolean|Checkbox)$/.test(dataType)?'boolean':
  /^(Date|DateTime|Date\/Time)$/.test(dataType)?'date':
  dataType==='Id'?'id':'text';

function routeWithoutSource(flow:FlowMetadata,source:number,target:number):boolean{
  const start=flow.elements.find(x=>x.type==='Start')?.id;
  if(start===undefined||source===start)return false;
  const visited=new Set<number>([source]);
  const queue=[start];
  while(queue.length){
    const id=queue.shift()!;
    if(id===target)return true;
    if(visited.has(id))continue;
    visited.add(id);
    for(const next of flow.connectors.filter(c=>c.from===id).map(c=>c.to))if(!visited.has(next))queue.push(next);
  }
  return false;
}

function sourceFor(flow:FlowMetadata,root:string):Choice|undefined{
  for(const element of flow.elements){
    const c=element.config;
    const outputName=element.type==='Get Records'?String(c.outputVariable||`element${element.id}`)
      :element.type==='Create Records'?`record${element.id}`:'';
    if(!outputName||outputName!==root)continue;
    const recordLimit=String(c.recordLimit??'1');
    return {origin:element.id,objectName:String(c.object||''),
      type:'Record',isCollection:element.type==='Get Records'&&recordLimit!=='1',
      fields:Array.isArray(c.fields)?c.fields.filter((f):f is string=>typeof f==='string'):undefined};
  }
  const loop=flow.elements.find(element=>element.type==='Loop'&&element.config.loopVariable===root);
  const resource=flow.resources.find(r=>r.name===root);
  if(loop){
    const collectionName=String(loop.config.collection||'');
    const collection=flow.resources.find(item=>item.name===collectionName&&item.isCollection);
    const getSource=flow.elements.find(item=>item.type==='Get Records'
      &&String(item.config.outputVariable||`element${item.id}`)===collectionName
      &&String(item.config.recordLimit??'1')!=='1');
    const objectName=collection?.dataType||String(getSource?.config.object||'');
    if(objectName)return {type:'Record',objectName,origin:loop.id,
      fields:getSource&&Array.isArray(getSource.config.fields)
        ?getSource.config.fields.filter((f):f is string=>typeof f==='string'):undefined};
  }
  if(resource)return {type:resource.type==='Record'?'Record':resource.dataType,
    objectName:resource.dataType,isCollection:resource.isCollection};
  // Screen inputs are persisted as top-level Flow variables after the interview is submitted.
  // Lookups contain validated record IDs, not whole objects.
  for(const element of flow.elements){
    if(element.type!=='Screen')continue;
    const fields=rows(element.config.fields);
    for(const field of fields){
      const name=typeof field.apiName==='string'?field.apiName
        :String(field.label??'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'');
      if(name!==root)continue;
      const type=String(field.type??'Text');
      if(['Display Text','Display Image','Section','Address','Name','Data Table',
        'File Upload','Repeater','Custom Component','Multi-Select Picklist'].includes(type)
        ||(type==='Choice Lookup'&&field.multipleSelections===true))return undefined;
      const lookup=type==='Lookup'||type==='Choice Lookup';
      return {type:lookup?'Id':type,origin:element.id,
        objectName:lookup?String(field.objectApiName??''):undefined};
    }
  }
  return undefined;
}

/** On-save metadata validation only; the runtime separately enforces RBAC and record access. */
export function flowReferenceErrors(flow:FlowMetadata,objects:ObjectMetadata[]):string[]{
  const errors:string[]=[];
  const object=(name?:string)=>objects.find(item=>item.apiName===name);
  const validate=(value:unknown,target:Row|undefined,element:{id:number;label:string},name:string)=>{
    if(typeof value!=='string')return;
    const raw=value.trim();
    const matched=expression.exec(raw);
    if(!matched){
      if(invalidExpression.test(raw))errors.push(`${element.label} / ${name}: invalid reference "${raw}". Use the reference picker.`);
      return;
    }
    const [root,...parts]=matched[1].split('.');
    if(['$Flow','$User','$CompanySettings'].includes(root))return;
    let source:Choice|undefined;
    if(['$Record','$Prior','$Record__Prior'].includes(root)){
      source={type:'Record',objectName:flow.triggerObject??undefined};
    } else source=sourceFor(flow,root);
    if(!source){errors.push(`${element.label} / ${name}: resource "${root}" does not exist.`);return;}
    if(source.origin!==undefined){
      if(source.origin===element.id||routeWithoutSource(flow,source.origin,element.id)){
        errors.push(`${element.label} / ${name}: "${root}" is not guaranteed on every path before this step.`);
      }
    }else if(source.type==='Record'){
      const resource=flow.resources.find(x=>x.name===root);
      if(!resource?.availableForInput){
        errors.push(`${element.label} / ${name}: record resource "${root}" has no earlier output or Flow input.`);
      }
    }
    if(parts.length>1){errors.push(`${element.label} / ${name}: nested paths beyond a record field are unsupported.`);return;}
    if(source.isCollection&&parts.length){
      errors.push(`${element.label} / ${name}: "${root}" is a collection; use a Loop record to select a field.`);return;
    }
    if(parts.length){
      if(source.type!=='Record'){errors.push(`${element.label} / ${name}: "${root}" is not a single Record.`);return;}
      const field=object(source.objectName)?.fields.find(x=>x.apiName===parts[0]);
      const type=field?.dataType??specialFields.get(parts[0]);
      if(!type){errors.push(`${element.label} / ${name}: "${root}.${parts[0]}" does not exist.`);return;}
      if(source.fields && !specialFields.has(parts[0]) && !source.fields.includes(parts[0])){
        errors.push(`${element.label} / ${name}: "${root}.${parts[0]}" was not selected in Fields to Store.`);return;
      }
      if(target){
        const expected=typed(String(target.dataType??'')),actual=typed(type);
        const relatedObject=field?.relationship?.targetObject;
        const sourceObject=actual==='lookup'?relatedObject
          :parts[0]==='Id'?source.objectName:undefined;
        const valid=expected==='lookup'
          ?(actual==='id'||actual==='lookup')&&Boolean(target.relationshipTarget)
            &&(actual!=='lookup'||Boolean(relatedObject))
            &&(!sourceObject||sourceObject===target.relationshipTarget)
          :expected==='id'
            ? actual==='lookup'
              ?Boolean(relatedObject)&&relatedObject===target.relationshipTarget
              :actual==='id'&&(!target.relationshipTarget||!sourceObject||sourceObject===target.relationshipTarget)
          :expected==='number'||expected==='boolean'||expected==='date'?actual===expected
          :actual==='text'||actual==='id';
        if(!valid)errors.push(`${element.label} / ${name}: "${root}.${parts[0]}" is incompatible with the filter field type.`);
      }
    }else if(source.type==='Record'||source.isCollection){
      errors.push(`${element.label} / ${name}: select a field of "${root}", not the whole record.`);
    }else if(target){
      const expected=typed(String(target.dataType??'')),actual=typed(source.type);
      const valid=expected==='lookup'
        ?actual==='id'&&Boolean(target.relationshipTarget)
          &&(!source.objectName||source.objectName===target.relationshipTarget)
        :expected==='id'?actual==='id'&&(!target.relationshipTarget||!source.objectName||source.objectName===target.relationshipTarget)
        :expected==='number'||expected==='boolean'||expected==='date'?actual===expected
        :actual==='text'||actual==='id';
      if(!valid)errors.push(`${element.label} / ${name}: "${root}" is incompatible with the target field type.`);
    }
  };
  const conditionCheck=(element:{id:number;label:string},condition:Row,objectName:string|undefined)=>{
    if(['Is Null','Is Not Null'].includes(String(condition.operator)))return;
    const fld=object(objectName)?.fields.find(x=>x.apiName===condition.field);
    const target=fld?{dataType:fld.dataType,relationshipTarget:fld.relationship?.targetObject}
      :condition.field==='Id'&&object(objectName)?{dataType:'Id',relationshipTarget:objectName}:undefined;
    validate(condition.value,target,element,'condition '+String(condition.field||'?'));
  };
  for(const element of flow.elements){
    const config=element.config,objectName=typeof config.object==='string'?config.object:flow.triggerObject??undefined;
    if(['Get Records','Update Records','Delete Records','Collection Filter'].includes(element.type))
      for(const cond of rows(config.conditions))conditionCheck(element,cond,objectName);
    if(element.type==='Decision')for(const outcome of rows(config.outcomes))
      for(const cond of rows(outcome.conditions))conditionCheck(element,cond,objectName);
    if(['Create Records','Update Records'].includes(element.type))
      for(const entry of rows(config.fieldValues)){
        const field=object(objectName)?.fields.find(x=>x.apiName===entry.field);
        validate(entry.value,field?{dataType:field.dataType,relationshipTarget:field.relationship?.targetObject}:undefined,
          element,'field '+String(entry.field||'?'));
      }
    if(element.type==='Assignment')validate(config.value,undefined,element,'assigned value');
  }
  return errors;
}
