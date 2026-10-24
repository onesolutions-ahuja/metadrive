import type {FlowNodeContext,FlowActionResult} from './NodeContext.js';
export async function executeGetRecordsNode(context:FlowNodeContext):Promise<FlowActionResult>{
 const {tenantId,userId,client,node,recordQuery,vars,evaluate,conditionsFrom}=context;
 const config=node.config;
 const apiName=/^[A-Za-z][A-Za-z0-9_]*$/;
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
        sortOrder:typeof config.sortOrder==='string'?config.sortOrder:undefined,limit,
        ownerScope:typeof config.ownerScope==='string'
          ?config.ownerScope as 'all'|'own'|'direct'|'descendants':undefined},client);
    const selectedFields=Array.isArray(config.fields)
      ?new Set(config.fields.filter((field):field is string=>typeof field==='string')):undefined;
    const projected=found.map(record=>!selectedFields?record:Object.fromEntries(Object.entries(record)
      .filter(([field])=>['Id','CreatedAt','LastModifiedDate','OwnerId','RecordTypeId'].includes(field)
        ||selectedFields.has(field))));
    vars[output]=limit===1?projected[0]??null:projected;
    return {handled:true};
}
