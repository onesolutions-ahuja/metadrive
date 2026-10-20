import {executeCountCollectionNode} from './CountCollectionNode.js';
import {executeFilterCollectionNode} from './FilterCollectionNode.js';
import {executeSortCollectionNode} from './SortCollectionNode.js';
import {executeTransformNode} from './TransformNode.js';
import {executeDeleteRecordsNode} from './DeleteRecordsNode.js';
import {executeUpdateRecordsNode} from './UpdateRecordsNode.js';
import {executeGetRecordsNode} from './GetRecordsNode.js';
import {executeCreateRecordsNode} from './CreateRecordsNode.js';
import {executeLoopNode} from './LoopNode.js';
import type {PoolClient} from 'pg';
import type {RecordEngine} from '../record-engine.js';
import type {FlowRecordQuery} from '../flow-record-query.js';
import type {FlowRecordCondition} from '../flow-record-query.js';
import {evaluateFlowDecisionOutcome} from '../flow-decision-runtime.js';

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

/** Shared pure collection operations, used by both execution and read-only debug. */
export function evaluateFlowCollectionStep(type:string,config:Record<string,unknown>,
  source:unknown,evaluate:(value:unknown)=>unknown):Record<string,unknown>[] {
  const records=recordValues(source);
  if(type==='Collection Filter')return executeFilterCollectionNode(config,records,evaluate,conditionsFrom);
  if(type==='Collection Sort')return executeSortCollectionNode(config,records);
  return executeTransformNode(config,records);
}

export async function executeFlowDataAction(context:Context):Promise<FlowActionResult> {
  const {tenantId,userId,client,node,records,recordQuery,vars,loops,evaluate,set}=context;
  const config=node.config;
  if(node.type==='Get Records')return executeGetRecordsNode({...context,conditionsFrom,recordValues,scalar});
  if(node.type==='Update Records')return executeUpdateRecordsNode({...context,conditionsFrom,recordValues,scalar});
  if(node.type==='Delete Records')return executeDeleteRecordsNode({...context,conditionsFrom,recordValues,scalar});
  if(node.type==='Loop')return executeLoopNode({node,vars,loops});
  if(node.type==='Count Collection'){
    const output=String(config.outputVariable??'');
    if(!apiName.test(output))throw new Error('Invalid Count Collection output variable');
    vars[output]=executeCountCollectionNode(vars[String(config.collection??'')]);
    return {handled:true};
  }
  if(node.type==='Collection Filter'||node.type==='Collection Sort'||node.type==='Transform'){
    const output=String(config.outputCollection??'');
    if(!apiName.test(output))throw new Error('Invalid collection output variable');
    vars[output]=evaluateFlowCollectionStep(node.type,config,
      vars[String(config.collection??'')],evaluate);
    return {handled:true};
  }
  if(node.type==='Create Records'||node.type==='CreateRecord')return executeCreateRecordsNode({...context,conditionsFrom,recordValues,scalar});
  return {handled:false};
}
