import type {PoolClient} from 'pg';
import type {RecordEngine} from './record-engine.js';
import type {FlowRecordQuery} from './flow-record-query.js';
import type {FlowRecordCondition} from './flow-record-query.js';
import {evaluateFlowDecisionOutcome} from './flow-decision-runtime.js';

type FlowNode={id:number;type:string;config:Record<string,unknown>};
type FlowActionResult={handled:boolean;selected?:string;clearHistory?:boolean};
type Context={
  tenantId:string;userId:string;client:PoolClient;node:FlowNode;
  records:RecordEngine;recordQuery:FlowRecordQuery;vars:Record<string,unknown>;
  loops:Map<number,number>;evaluate:(value:unknown)=>unknown;
  set:(name:unknown,value:string|number|boolean|null)=>void;
};
type Condition={field:unknown;operator:unknown;value?:unknown};
const apiName=/^[A-Za-z][A-Za-z0-9_]*$/;
const scalar=(value:unknown):value is string|number|boolean|null=>
  value===null||typeof value==='string'||typeof value==='boolean'
  ||typeof value==='number'&&Number.isFinite(value);

function conditionsFrom(value:unknown,evaluate:(value:unknown)=>unknown):FlowRecordCondition[] {
  if(value===undefined)return [];
  if(!Array.isArray(value))throw new Error('Flow record conditions must be a list');
  if(value.length>50)throw new Error('Flow record actions support at most 50 conditions');
  return value.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid Flow record condition');
    const condition=item as Record<string,unknown>;
    if(typeof condition.field!=='string'||!apiName.test(condition.field))
      throw new Error('Invalid Flow record condition field');
    const compared=condition.value===undefined?undefined:evaluate(condition.value);
    if(compared!==undefined&&compared!==null&&!scalar(compared))
      throw new Error('Flow record condition values must be scalar');
    return {field:condition.field,operator:condition.operator,value:compared};
  });
}

function recordValues(value:unknown):Record<string,unknown>[] {
  if(!Array.isArray(value)||value.length>200)
    throw new Error('Flow record collection must contain at most 200 records');
  for(const item of value)
    if(!item||typeof item!=='object'||Array.isArray(item))
      throw new Error('Flow record collection items must be records');
  return value as Record<string,unknown>[];
}

export async function executeFlowDataAction(context:Context):Promise<FlowActionResult> {
  const {tenantId,userId,client,node,records,recordQuery,vars,loops,evaluate,set}=context;
  const config=node.config;
  if(node.type==='Get Records'){
    const objectApi=String(config.object??'');
    const conditions=conditionsFrom(config.conditions,evaluate);
    const rawLimit=config.recordLimit??'1';
    const limit=rawLimit==='all'?200:Number(rawLimit);
    if(!Number.isSafeInteger(limit)||limit<1||limit>200)
      throw new Error('Get Records limit must be between 1 and 200');
    const output=typeof config.outputVariable==='string'&&config.outputVariable
      ?config.outputVariable:'record'+node.id;
    if(!apiName.test(output))throw new Error('Invalid Get Records output variable');
    const found=await recordQuery.find(tenantId,userId,objectApi,conditions,
      typeof config.conditionLogic==='string'?config.conditionLogic:undefined,
      {sortField:typeof config.sortField==='string'&&config.sortField?config.sortField:undefined,
        sortOrder:typeof config.sortOrder==='string'?config.sortOrder:undefined,limit},client);
    const selectedFields=Array.isArray(config.fields)
      ?new Set(config.fields.filter((field):field is string=>typeof field==='string')):undefined;
    const projected=found.map(record=>!selectedFields?record:Object.fromEntries(Object.entries(record)
      .filter(([field])=>['Id','CreatedAt','LastModifiedDate','OwnerId','RecordTypeId'].includes(field)
        ||selectedFields.has(field))));
    vars[output]=limit===1?projected[0]??null:projected;
    return {handled:true};
  }
  if(node.type==='Update Records'||node.type==='Delete Records'){
    const objectApi=String(config.object??'');
    if(!apiName.test(objectApi))throw new Error('Invalid record mutation Object');
    const configuredId=config.recordId===undefined?'':evaluate(config.recordId);
    let targets:Record<string,unknown>[];
    if(config.recordSource==='collection'){
      targets=recordValues(vars[String(config.collection??'')]);
    }else if(config.recordSource==='record'){
      const record=vars[String(config.recordVariable??'')];
      if(!record||typeof record!=='object'||Array.isArray(record))
        throw new Error('Record mutation requires a single record variable');
      targets=[record as Record<string,unknown>];
    }else if(typeof configuredId==='string'&&configuredId){
      targets=[{Id:configuredId}];
    }else{
      const conditions=conditionsFrom(config.conditions,evaluate);
      if(!conditions.length)throw new Error('Record mutation requires an ID, record collection, or filter condition');
      targets=await recordQuery.find(tenantId,userId,objectApi,conditions,
        typeof config.conditionLogic==='string'?config.conditionLogic:undefined,
        {limit:200},client);
    }
    if(targets.length>200)throw new Error('Flow record mutation exceeds the 200-record limit');
    if(node.type==='Delete Records'){
      for(const record of targets){
        if(typeof record.Id!=='string')throw new Error('Invalid Delete Records target');
        await records.remove(tenantId,userId,objectApi,record.Id,client);
      }
    }else{
      const fieldValues:Record<string,unknown>={};
      const assignments=Array.isArray(config.fieldValues)?config.fieldValues:[];
      if(assignments.length<1||assignments.length>100)
        throw new Error('Update Records requires between 1 and 100 field assignments');
      for(const item of assignments as Array<Record<string,unknown>>){
        const field=String(item.field??item.apiName??'');
        if(!apiName.test(field))throw new Error('Invalid Update Records field');
        const value=evaluate(item.value??null);
        if(!scalar(value))throw new Error('Update Records values must be scalar');
        fieldValues[field]=value;
      }
      for(const record of targets){
        if(typeof record.Id!=='string')throw new Error('Invalid Update Records target');
        await records.update(tenantId,userId,objectApi,record.Id,fieldValues,undefined,client);
      }
    }
    return {handled:true,clearHistory:true};
  }
  if(node.type==='Loop'){
    const collection=vars[String(config.collection??'')];
    if(!Array.isArray(collection)||collection.length>200)
      throw new Error('Loop source must be a record collection of at most 200 records');
    const direction=config.direction==='Last to first'?-1:1;
    let index=loops.get(node.id);
    if(index===undefined)index=direction===1?0:collection.length-1;
    if(index<0||index>=collection.length){
      loops.delete(node.id);
      return {handled:true,selected:'After Last'};
    }
    const item=collection[index];
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Loop items must be records');
    if(typeof config.loopVariable!=='string'||!apiName.test(config.loopVariable))
      throw new Error('Invalid Loop variable');
    vars[config.loopVariable]=item;
    loops.set(node.id,index+direction);
    return {handled:true,selected:'For Each'};
  }
  if(node.type==='Collection Filter'||node.type==='Collection Sort'||node.type==='Transform'){
    const source=vars[String(config.collection??'')];
    if(!Array.isArray(source))throw new Error('Collection action source must be a record collection');
    const output=String(config.outputCollection??'');
    if(!apiName.test(output))throw new Error('Invalid collection output variable');
    if(node.type==='Collection Filter'){
      const conditions=conditionsFrom(config.conditions,evaluate);
      if(conditions.length===0)throw new Error('Collection Filter requires at least one condition');
      const filtered=recordValues(source).filter(item=>{
        const rows=conditions.map(condition=>({...condition,
          field:item[String(condition.field)]}));
        return evaluateFlowDecisionOutcome(rows,
          typeof config.conditionLogic==='string'?config.conditionLogic:undefined,value=>value);
      });
      vars[output]=filtered;
    }else if(node.type==='Collection Sort'){
      const field=String(config.sortField??'');
      if(!apiName.test(field))throw new Error('Invalid Collection Sort field');
      const direction=config.sortOrder==='Descending'?-1:1;
      vars[output]=[...recordValues(source)].sort((left,right)=>{
        const a=left[field],b=right[field];
        if(a===b)return 0;
        if(a===null||a===undefined)return 1;
        if(b===null||b===undefined)return -1;
        if(typeof a!==typeof b||!['string','number'].includes(typeof a))
          throw new Error('Collection Sort values must be matching text or numbers');
        return a<b?-direction:direction;
      });
    }else{
      const mappings=Array.isArray(config.mappings)?config.mappings:[];
      if(mappings.length<1||mappings.length>100)
        throw new Error('Transform requires between 1 and 100 field mappings');
      vars[output]=recordValues(source).map(item=>{
        const target:Record<string,unknown>={};
        for(const mapping of mappings){
          if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))
            throw new Error('Invalid Transform mapping');
          const row=mapping as Record<string,unknown>;
          if(typeof row.sourceField!=='string'||typeof row.targetField!=='string'
            ||!apiName.test(row.sourceField)||!apiName.test(row.targetField))
            throw new Error('Invalid Transform field mapping');
          target[row.targetField]=item[row.sourceField]??null;
        }
        return target;
      });
    }
    return {handled:true};
  }
  if(node.type==='Create Records'||node.type==='CreateRecord'){
    const objectApi=String(config.object??config.objectApi??'');
    if(!apiName.test(objectApi))throw new Error('Invalid Flow Object');
    if(config.recordSource==='collection'){
      const source=recordValues(vars[String(config.collection??'')]);
      const created:Record<string,unknown>[]=[];
      for(const item of source){
        const fields:Record<string,unknown>={};
        if(Object.keys(item).filter(field=>field!=='Id').length>100)
          throw new Error('Create Records collection items may contain at most 100 fields');
        for(const [field,value] of Object.entries(item)){
          if(field==='Id')continue;
          if(!apiName.test(field)||!scalar(value))
            throw new Error('Invalid Create Records collection field: '+field);
          fields[field]=value;
        }
        const id=await records.createInTransaction(client,tenantId,userId,objectApi,fields);
        created.push({...fields,Id:id});
      }
      if(typeof config.resultVariable==='string'&&config.resultVariable)
        vars[config.resultVariable]=created;
    }else{
      const fields:Record<string,unknown>={};
      const assignments=Array.isArray(config.fieldValues)?config.fieldValues:[];
      if(assignments.length<1||assignments.length>100)
        throw new Error('Create Records requires between 1 and 100 field assignments');
      for(const item of assignments as Array<Record<string,unknown>>){
        const field=String(item.field??item.apiName??'');
        if(!apiName.test(field))throw new Error('Invalid Flow Field');
        const value=evaluate(item.value??null);
        if(!scalar(value))throw new Error('Create Records values must be scalar');
        fields[field]=value;
      }
      const id=await records.createInTransaction(client,tenantId,userId,objectApi,fields);
      if(typeof config.resultVariable==='string'&&config.resultVariable)
        set(config.resultVariable,id);
    }
    return {handled:true,clearHistory:true};
  }
  return {handled:false};
}
