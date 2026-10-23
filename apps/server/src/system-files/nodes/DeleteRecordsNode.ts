import type {FlowNodeContext,FlowActionResult} from './NodeContext.js';
import {resolveMutationTargets} from './RecordMutationTargets.js';
import {prepareDocumentLineMutation,recalculateDocumentLineTotals} from './DocumentFinancialGuard.js';
export async function executeDeleteRecordsNode(context:FlowNodeContext):Promise<FlowActionResult>{
 const {tenantId,userId,client,records}=context;
 const {objectApi,targets}=await resolveMutationTargets(context);
      for(const record of targets){
        if(typeof record.Id!=='string')throw new Error('Invalid Delete Records target');
        const lineMutation=objectApi==='QuotationLine'||objectApi==='InvoiceLine'
          ?await prepareDocumentLineMutation(context,context.node.config.documentLineTotals,record.Id,{}):null;
        await records.remove(tenantId,userId,objectApi,record.Id,client);
        if(lineMutation)await recalculateDocumentLineTotals(context,context.node.config.documentLineTotals,lineMutation.oldParent??lineMutation.newParent);
      }
 return {handled:true,clearHistory:true};
}
