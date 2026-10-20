import type {PoolClient} from 'pg';
/** Base relationship query for tenant-scoped related record IDs; caller owns RBAC/visibility. */
export async function findRelatedRecordIds(client:PoolClient,tenantId:string,objectApi:string,fieldApi:string,parentRecordId:string){
 const {rows}=await client.query<{id:string}>(`
 SELECT r.id FROM md_records r JOIN md_record_values v ON v.tenant_id=r.tenant_id AND v.record_id=r.id
 WHERE r.tenant_id=$1 AND r.object_api=$2 AND r.is_deleted=false AND v.field_api=$3 AND v.reference_record_id=$4
 ORDER BY r.id`,[tenantId,objectApi,fieldApi,parentRecordId]);
 return rows.map(row=>row.id);
}
