import type {PoolClient} from 'pg';
/** Persist matched records in tenant-scoped SQL using the existing constraints. */
export async function saveDuplicateMatches(client:PoolClient,tenantId:string,objectApi:string,recordId:string,
 matches:Array<{ruleApi:string;recordId:string}>|null){
  if(matches===null)return;
  await client.query('DELETE FROM md_duplicate_record_sets WHERE tenant_id=$1 AND object_api=$2 AND record_id=$3',
   [tenantId,objectApi,recordId]);
  for(const match of matches)await client.query(`INSERT INTO md_duplicate_record_sets
   (tenant_id,object_api,rule_api,record_id,matched_record_id) VALUES($1,$2,$3,$4,$5)
   ON CONFLICT DO NOTHING`,[tenantId,objectApi,match.ruleApi,recordId,match.recordId]);
 }
