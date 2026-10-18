import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';

export class PlatformTenantService {
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine){}
 private async platformScope(tenantId:string,userId:string){
  await this.rbac.require(tenantId,userId,'Tenant','manage');
  // Tenant developer wildcard policy must never imply cross-tenant administration.
  const {rows}=await this.db.query<{authorised:boolean}>(`
   SELECT EXISTS(
     SELECT 1 FROM md_permission_assignments a
       JOIN md_permission_sets p ON p.tenant_id=a.tenant_id AND p.id=a.permission_set_id
       WHERE a.tenant_id=$1 AND a.user_id=$2 AND p.api_name='PlatformDeveloper'
     UNION ALL
     SELECT 1 FROM md_user_roles ur
       JOIN md_role_permission_sets rp ON rp.tenant_id=ur.tenant_id AND rp.role_id=ur.role_id
       JOIN md_permission_sets p ON p.tenant_id=rp.tenant_id AND p.id=rp.permission_set_id
       WHERE ur.tenant_id=$1 AND ur.user_id=$2 AND p.api_name='PlatformDeveloper'
   ) AS authorised`,[tenantId,userId]);
  return rows[0]?.authorised===true;
 }
 async list(tenantId:string,userId:string,parameters:Record<string,unknown>){
  const platform=await this.platformScope(tenantId,userId);
  const page=Number(parameters.page??1),pageSize=Number(parameters.pageSize??25);
  if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)
   throw new Error('Invalid pagination');
  const q=typeof parameters.q==='string'?parameters.q.trim():'';
  if(q.length>200)throw new Error('Invalid search');
  const status=parameters.status??'ALL';
  if(!['ALL','ACTIVE','SUSPENDED','ARCHIVED'].includes(String(status)))
   throw new Error('Invalid status');
  const search=q?('%'+q.replace(/[%_\\]/g,'\\$&')+'%'):null;
  const scopedTenant=platform?null:tenantId;
  const statusFilter=status==='ALL'||status==='ACTIVE';
  const {rows}=await this.db.query<{
   id:string;slug:string;name:string;created_at:Date|null;users:string;active_users:string;
  }>(`
    SELECT t.id,t.slug,t.name,null::timestamptz AS created_at,
      (SELECT count(*)::text FROM md_users u WHERE u.tenant_id=t.id) AS users,
      (SELECT count(*)::text FROM md_users u WHERE u.tenant_id=t.id AND u.enabled) AS active_users
    FROM md_tenants t
    WHERE ($1::uuid IS NULL OR t.id=$1)
      AND ($2::text IS NULL OR t.slug ILIKE $2 OR t.name ILIKE $2)
      AND $3::boolean
    ORDER BY t.slug LIMIT $4 OFFSET $5
  `,[scopedTenant,search,statusFilter,pageSize,(page-1)*pageSize]);
  const {rows:counts}=await this.db.query<{total:string}>(`
    SELECT count(*)::text AS total FROM md_tenants t
    WHERE ($1::uuid IS NULL OR t.id=$1)
      AND ($2::text IS NULL OR t.slug ILIKE $2 OR t.name ILIKE $2)
      AND $3::boolean
  `,[scopedTenant,search,statusFilter]);
  return {tenants:rows.map(t=>({
   tenantId:t.slug,name:t.name,description:'',status:'ACTIVE' as const,
   createdAt:t.created_at??new Date(0),updatedAt:t.created_at??new Date(0),
   userCount:Number(t.users),activeUserCount:Number(t.active_users),
   provisioning:{status:'READY' as const,version:1,completedAt:''},developerAccount:null
  })),total:Number(counts[0]?.total??0)};
 }
}
