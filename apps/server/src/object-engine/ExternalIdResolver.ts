import type {RecordEngine} from '../system-files/record-engine.js';
/** External IDs are resolved by existing field definitions and authorized upsert. */
export function upsertRecordByExternalId(records:RecordEngine,tenantId:string,userId:string,objectApi:string,fieldApi:string,value:string,properties:Record<string,unknown>){
 return records.upsertByExternalId(tenantId,userId,objectApi,fieldApi,value,properties);
}
