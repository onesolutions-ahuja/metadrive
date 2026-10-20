import type {PoolClient} from 'pg';
/** SQL, not this module, owns tenant relationship metadata. */
export async function registeredRelationships(client:PoolClient,tenantId:string,relatedObject:{recordId:string;objectApi:string}){
 const {rows}=await client.query<{record_id:string;object_api:string;field_api:string;relationship_type:string;delete_behavior:string|null;required:boolean}>(`
 SELECT r.id AS record_id,r.object_api,f.api_name AS field_api,
 COALESCE(f.relationship_type,'Lookup') AS relationship_type,f.delete_behavior,f.required
 FROM md_record_values v
 JOIN md_records r ON r.tenant_id=v.tenant_id AND r.id=v.record_id AND r.is_deleted=false
 JOIN md_field_definitions f ON f.tenant_id=v.tenant_id AND f.object_api=v.object_api AND f.api_name=v.field_api
 WHERE v.tenant_id=$1 AND v.reference_record_id=$2 AND f.related_object=$3
 ORDER BY f.relationship_type,r.object_api,r.id`,[tenantId,relatedObject.recordId,relatedObject.objectApi]);
 return rows;
}
