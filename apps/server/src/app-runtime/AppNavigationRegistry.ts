import type {SqlPersistence} from '../system-files/sql-persistence.js';
/** App navigation is always scoped to installed tenant app IDs. */
export async function loadAppNavigation(db:SqlPersistence,tenantId:string,appIds:readonly string[]){
 if(!appIds.length)return {navigation:[],utilities:[]};
 const [navigation,utilities]=await Promise.all([
  db.query<{app_id:string;entry_type:'Object'|'App Page';api_name:string;sort_order:number}>(`
   SELECT app_id,entry_type,api_name,sort_order FROM md_tenant_app_navigation
   WHERE tenant_id=$1 AND app_id=ANY($2::uuid[]) ORDER BY sort_order`,[tenantId,appIds]),
  db.query<{app_id:string;utility_name:'Notes'|'History'}>(`
   SELECT app_id,utility_name FROM md_tenant_app_utilities
   WHERE tenant_id=$1 AND app_id=ANY($2::uuid[]) ORDER BY sort_order`,[tenantId,appIds])
 ]);
 return {navigation:navigation.rows,utilities:utilities.rows};
}
