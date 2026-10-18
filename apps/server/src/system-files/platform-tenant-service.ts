import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import {TenantProvisioning} from './tenant-provisioning.js';

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
 async create(tenantId:string,userId:string,details:{
  tenantId:string;tenantName:string;email:string;password:string;developerDomain?:string;
 },requestKey:string,hostname:string){
  if(!(await this.platformScope(tenantId,userId)))throw Error('Platform Developer permission required');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey))
   throw Error('Idempotency-Key must be a UUID');
  const slug=details.tenantId,name=details.tenantName,email=details.email,password=details.password;
  if(typeof slug!=='string'||typeof name!=='string'||typeof email!=='string'||typeof password!=='string')
   throw Error('Invalid tenant creation request');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||!name.trim()||name.length>200)
   throw Error('Invalid tenant identity');
  const domain=(details.developerDomain||slug+'.'+hostname).toLowerCase();
  if(!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)||domain.length>253)throw Error('Invalid tenant domain');
  const previous=await this.db.query<{tenant_slug:string}>(
   'SELECT tenant_slug FROM md_platform_provision_requests WHERE operator_tenant_id=$1 AND request_key=$2',
   [tenantId,requestKey]);
  if(previous.rows[0]){
   if(previous.rows[0].tenant_slug!==slug)throw Error('Provision request key was used for another tenant');
   const existing=await this.db.query<{id:string;slug:string;name:string}>(
    'SELECT id,slug,name FROM md_tenants WHERE slug=$1',[slug]);
   if(!existing.rows[0])throw Error('Provision request points to a missing tenant');
   return {tenant:{tenantId:slug,name:existing.rows[0].name,description:'',status:'ACTIVE',
    userCount:1,activeUserCount:1,provisioning:{status:'READY',version:1,completedAt:''},developerAccount:null},replayed:true};
  }
  await new TenantProvisioning(this.db).provision({
   slug,name:name.trim(),domain,developerEmail:email,developerPassword:password
  });
  await this.db.query(`INSERT INTO md_platform_provision_requests(operator_tenant_id,request_key,tenant_slug,requested_by)
   VALUES($1,$2,$3,$4) ON CONFLICT(operator_tenant_id,request_key) DO NOTHING`,
   [tenantId,requestKey,slug,userId]);
  return {tenant:{tenantId:slug,name:name.trim(),description:'',status:'ACTIVE',
   userCount:1,activeUserCount:1,provisioning:{status:'READY',version:1,completedAt:''},developerAccount:null},replayed:false};
 }
 async requirePlatformOperator(tenantId:string,userId:string){
  if(!(await this.platformScope(tenantId,userId)))throw Error('Platform Developer permission required');
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
  const conditions=[platform?'true':'t.id=$1::uuid'];
  const n=platform?0:1;
  if(q)conditions.push(`(t.slug ILIKE ${n+1} OR t.name ILIKE ${n+1})`);
  if(status!=='ALL' && status!=='ACTIVE')conditions.push('false');
  const values:unknown[]=platform?[]:[tenantId];
  if(q)values.push('%'+q.replace(/[%_\\]/g,'\\$&')+'%');
  const where=conditions.join(' AND ');
  const {rows}=await this.db.query<{
   id:string;slug:string;name:string;created_at:Date|null;users:string;active_users:string;
  }>(`
    SELECT t.id,t.slug,t.name,
      null::timestamptz AS created_at,
      (SELECT count(*)::text FROM md_users u WHERE u.tenant_id=t.id) AS users,
      (SELECT count(*)::text FROM md_users u WHERE u.tenant_id=t.id AND u.enabled) AS active_users
    FROM md_tenants t WHERE ${where}
    ORDER BY t.slug LIMIT ${values.length+1} OFFSET ${values.length+2}
  `,[...values,pageSize,(page-1)*pageSize]);
  const {rows:counts}=await this.db.query<{total:string}>(
   `SELECT count(*)::text AS total FROM md_tenants t WHERE ${where}`,values);
  return {tenants:rows.map(t=>({
   tenantId:t.slug,name:t.name,description:'',status:'ACTIVE' as const,
   createdAt:t.created_at??new Date(0),updatedAt:t.created_at??new Date(0),
   userCount:Number(t.users),activeUserCount:Number(t.active_users),
   provisioning:{status:'READY' as const,version:1,completedAt:''},developerAccount:null
  })),total:Number(counts[0]?.total??0)};
 }
}
