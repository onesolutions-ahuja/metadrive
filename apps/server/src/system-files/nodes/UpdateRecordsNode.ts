import type {FlowNodeContext,FlowActionResult} from './NodeContext.js';
import {resolveMutationTargets} from './RecordMutationTargets.js';
export async function executeUpdateRecordsNode(context:FlowNodeContext):Promise<FlowActionResult>{
 const {tenantId,userId,client,records,evaluate,scalar}=context;
 const config=context.node.config;
 const apiName=/^[A-Za-z][A-Za-z0-9_]*$/;
 const {objectApi,targets}=await resolveMutationTargets(context);
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
 return {handled:true,clearHistory:true};
}
