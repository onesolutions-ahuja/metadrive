import type {PoolClient} from 'pg';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
/** Resolve a reference only within the caller's tenant, without bypassing Record Engine RBAC. */
export async function assertLookupTargetExists(db:SqlPersistence|PoolClient,tenantId:string,objectApi:string|null,recordId:string,fieldKey:string){
 const match=await db.query('SELECT id FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3 AND is_deleted=false',[tenantId,objectApi,recordId]);
 if(!match.rowCount)throw new Error('Invalid relationship target: '+fieldKey);
}
