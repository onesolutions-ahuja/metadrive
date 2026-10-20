import type {FlowNodeContext,FlowActionResult} from './NodeContext.js';
import {resolveMutationTargets} from './RecordMutationTargets.js';
export async function executeDeleteRecordsNode(context:FlowNodeContext):Promise<FlowActionResult>{
 const {tenantId,userId,client,records}=context;
 const {objectApi,targets}=await resolveMutationTargets(context);
      for(const record of targets){
        if(typeof record.Id!=='string')throw new Error('Invalid Delete Records target');
        await records.remove(tenantId,userId,objectApi,record.Id,client);
      }
 return {handled:true,clearHistory:true};
}
