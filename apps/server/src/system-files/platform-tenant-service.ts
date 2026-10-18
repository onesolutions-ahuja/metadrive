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
 async getSetting(tenantId:string,userId:string,key:'company-profile'|'currencies'|'automation-settings') {
  await this.rbac.require(tenantId,userId,'TenantSettings','read');
  const {rows}=await this.db.query<{properties:unknown}>(
    'SELECT properties FROM md_tenant_settings WHERE tenant_id=$1 AND setting_key=$2',[tenantId,key]);
  return rows[0]?.properties??null;
 }
 async saveSetting(tenantId:string,userId:string,key:'company-profile'|'currencies'|'automation-settings',payload:unknown) {
  await this.rbac.require(tenantId,userId,'TenantSettings','manage');
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Invalid tenant settings');
  const data=payload as Record<string,unknown>;
  if(key==='company-profile') {
    const fields=['logoUrl','legalName','tradingName','website','phone','email','addressLine1','addressLine2','city','postcode','country','timezone','locale','description'];
    if(Object.keys(data).some(k=>!fields.includes(k))||Object.values(data).some(v=>typeof v!=='string'||v.length>2048))
      throw new Error('Invalid company profile');
    if(data.logoUrl&&(!String(data.logoUrl).startsWith('https://')||String(data.logoUrl).length>2048))
      throw new Error('Invalid company logo URL');
  } else if(key==='currencies') {
    const currencies=data.currencies;
    if(typeof data.corporateCurrency!=='string'||! /^[A-Z]{3}$/.test(data.corporateCurrency)
      ||typeof data.standardVatRate!=='number'||!Number.isFinite(data.standardVatRate)
      ||data.standardVatRate<0||data.standardVatRate>100||!Array.isArray(currencies)||currencies.length<1||currencies.length>100)
      throw new Error('Invalid currency settings');
    const codes=new Set<string>();
    for(const item of currencies) {
      if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid currency');
      const x=item as Record<string,unknown>;
      if(typeof x.currencyIsoCode!=='string'||! /^[A-Z]{3}$/.test(x.currencyIsoCode)
        ||typeof x.conversionRate!=='number'||!Number.isFinite(x.conversionRate)||x.conversionRate<=0
        ||codes.has(x.currencyIsoCode)||Object.keys(x).some(k=>!['currencyIsoCode','conversionRate'].includes(k)))
        throw new Error('Invalid currency');
      codes.add(x.currencyIsoCode);
      if(x.currencyIsoCode===data.corporateCurrency&&x.conversionRate!==1)
        throw new Error('Invalid corporate currency conversion');
    }
    if(!codes.has(data.corporateCurrency)||Object.keys(data).some(k=>!['corporateCurrency','standardVatRate','currencies'].includes(k)))
      throw new Error('Invalid currency settings');
  } else {
    if(typeof data.autoRetryFailedFlows!=='boolean'
       ||!Number.isInteger(data.maxRetryAttempts)||Number(data.maxRetryAttempts)<0||Number(data.maxRetryAttempts)>100
       ||!Number.isInteger(data.conversationIdleMinutes)||Number(data.conversationIdleMinutes)<1||Number(data.conversationIdleMinutes)>1440
       ||Object.keys(data).some(k=>!['autoRetryFailedFlows','maxRetryAttempts','conversationIdleMinutes'].includes(k)))
      throw new Error('Invalid automation settings');
  }
  const {rows}=await this.db.query<{properties:Record<string,unknown>}>(`
    INSERT INTO md_tenant_settings(tenant_id,setting_key,properties) VALUES ($1,$2,$3::jsonb)
    ON CONFLICT (tenant_id,setting_key) DO UPDATE
      SET properties=EXCLUDED.properties,revision=md_tenant_settings.revision+1,updated_at=now()
    RETURNING properties
  `,[tenantId,key,JSON.stringify(data)]);
  return rows[0].properties;
 }
 private async requirePlatform(tenantId:string,userId:string){
  if(!(await this.platformScope(tenantId,userId)))throw new Error('Permission denied');
 }
 async get(tenantId:string,userId:string,slug:string) {
  const platform=await this.platformScope(tenantId,userId);
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error('Invalid tenant');
  const {rows}=await this.db.query<{
   id:string;slug:string;name:string;description:string;status:'ACTIVE'|'SUSPENDED'|'ARCHIVED';
   created_at:Date;updated_at:Date;archived_at:Date|null;retention_until:Date|null;legal_hold:boolean;
   users:string;active_users:string
  }>(`
    SELECT t.id,t.slug,t.name,t.description,t.status,t.created_at,t.updated_at,
      t.archived_at,t.retention_until,t.legal_hold,
      (SELECT count(*)::text FROM md_users u WHERE u.tenant_id=t.id) AS users,
      (SELECT count(*)::text FROM md_users u WHERE u.tenant_id=t.id AND u.enabled=true) AS active_users
    FROM md_tenants t WHERE t.slug=$1 AND ($2::uuid IS NULL OR t.id=$2)
  `,[slug,platform?null:tenantId]);
  const t=rows[0];if(!t)throw new Error('Tenant not found');
  return {tenant:{
   tenantId:t.slug,name:t.name,description:t.description,status:t.status,
   createdAt:t.created_at,updatedAt:t.updated_at,archivedAt:t.archived_at,
   retentionUntil:t.retention_until,legalHold:t.legal_hold,
   userCount:Number(t.users),activeUserCount:Number(t.active_users),
   provisioning:{status:'READY' as const,version:1,completedAt:t.created_at},developerAccount:null
  }};
 }
 async updateDetails(tenantId:string,userId:string,slug:string,body:unknown) {
  await this.requirePlatform(tenantId,userId);
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid tenant');
  const {name,description}=body as Record<string,unknown>;
  if(typeof name!=='string'||!name.trim()||name.length>200
     ||typeof description!=='string'||description.length>2000)throw new Error('Invalid tenant');
  const {rowCount}=await this.db.query(
    'UPDATE md_tenants SET name=$2,description=$3,updated_at=now() WHERE slug=$1',
    [slug,name.trim(),description]);
  if(!rowCount)throw new Error('Tenant not found');
  return this.get(tenantId,userId,slug);
 }
 async updateRetention(tenantId:string,userId:string,slug:string,body:unknown) {
  await this.requirePlatform(tenantId,userId);
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid retention');
  const {retentionUntil,legalHold}=body as Record<string,unknown>;
  if(typeof legalHold!=='boolean'
    ||!(retentionUntil===null||(typeof retentionUntil==='string'&&Number.isFinite(Date.parse(retentionUntil)))))
    throw new Error('Invalid retention');
  const {rowCount}=await this.db.query(
   'UPDATE md_tenants SET retention_until=$2::timestamptz,legal_hold=$3,updated_at=now() WHERE slug=$1',
   [slug,retentionUntil,legalHold]);
  if(!rowCount)throw new Error('Tenant not found');
  return this.get(tenantId,userId,slug);
 }
 async transition(tenantId:string,userId:string,slug:string,operation:'suspend'|'reactivate'|'archive'|'restore') {
  await this.requirePlatform(tenantId,userId);
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error('Invalid tenant');
  const transition={
   suspend:{from:'ACTIVE',to:'SUSPENDED'},
   reactivate:{from:'SUSPENDED',to:'ACTIVE'},
   archive:{from:'SUSPENDED',to:'ARCHIVED'},
   restore:{from:'ARCHIVED',to:'SUSPENDED'}
  }[operation];
  await this.db.transaction(async client=>{
   const target=await client.query<{id:string;status:string}>(
    'SELECT id,status FROM md_tenants WHERE slug=$1 FOR UPDATE',[slug]);
   const row=target.rows[0];if(!row)throw new Error('Tenant not found');
   if(row.status!==transition.from)throw new Error('Invalid tenant status transition');
   await client.query(`
     UPDATE md_tenants SET status=$2,updated_at=now(),
       archived_at=CASE WHEN $2='ARCHIVED' THEN now() ELSE NULL END
     WHERE id=$1`,[row.id,transition.to]);
   // Once suspended or archived, access AND refresh sessions must not remain valid.
   if(transition.to!=='ACTIVE'){
     await client.query('UPDATE md_sessions SET revoked_at=now() WHERE tenant_id=$1 AND revoked_at IS NULL',[row.id]);
     await client.query('UPDATE md_refresh_sessions SET revoked_at=now() WHERE tenant_id=$1 AND revoked_at IS NULL',[row.id]);
   }
   await client.query(`
    INSERT INTO md_tenant_lifecycle_audit
     (actor_tenant_id,actor_user_id,target_tenant_id,operation,previous_status,new_status)
    VALUES ($1,$2,$3,$4,$5,$6)`,
    [tenantId,userId,row.id,operation,transition.from,transition.to]);
  });
  return this.get(tenantId,userId,slug);
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
  const {rows}=await this.db.query<{
   id:string;slug:string;name:string;description:string;status:'ACTIVE'|'SUSPENDED'|'ARCHIVED';
   created_at:Date;updated_at:Date;archived_at:Date|null;retention_until:Date|null;legal_hold:boolean;
   users:string;active_users:string;
  }>(`
    SELECT t.id,t.slug,t.name,t.description,t.status,t.created_at,t.updated_at,
      t.archived_at,t.retention_until,t.legal_hold,
      (SELECT count(*)::text FROM md_users u WHERE u.tenant_id=t.id) AS users,
      (SELECT count(*)::text FROM md_users u WHERE u.tenant_id=t.id AND u.enabled=true) AS active_users
    FROM md_tenants t
    WHERE ($1::uuid IS NULL OR t.id=$1)
      AND ($2::text IS NULL OR t.slug ILIKE $2 OR t.name ILIKE $2)
      AND ($3::text='ALL' OR t.status=$3)
    ORDER BY t.slug LIMIT $4 OFFSET $5
  `,[scopedTenant,search,status,pageSize,(page-1)*pageSize]);
  const {rows:counts}=await this.db.query<{total:string}>(`
    SELECT count(*)::text AS total FROM md_tenants t
    WHERE ($1::uuid IS NULL OR t.id=$1)
      AND ($2::text IS NULL OR t.slug ILIKE $2 OR t.name ILIKE $2)
      AND ($3::text='ALL' OR t.status=$3)
  `,[scopedTenant,search,status]);
  return {tenants:rows.map(t=>({
   tenantId:t.slug,name:t.name,description:t.description,status:t.status,
   createdAt:t.created_at,updatedAt:t.updated_at,archivedAt:t.archived_at,
   retentionUntil:t.retention_until,legalHold:t.legal_hold,
   userCount:Number(t.users),activeUserCount:Number(t.active_users),
   provisioning:{status:'READY' as const,version:1,completedAt:t.created_at},developerAccount:null
  })),total:Number(counts[0]?.total??0)};
 }
}
