import {createHash} from 'node:crypto';
import type {SqlPersistence} from './sql-persistence.js';
import {AuthenticationService} from './authentication.js';
import {seedFreshCoreObjects} from '../app-seeders/fresh-core-objects.js';
import {seedFreshBundledComponents} from '../app-seeders/bundled-components.js';

export type TenantRequest={
  slug:string;
  name:string;
  domain:string;
  developerEmail:string;
  developerPassword:string;
  developerName?:string;
};
export type ProvisioningAuthority={actorTenantId:string;actorUserId:string;idempotencyKey:string};
export class TenantProvisioning {
  constructor(private readonly db:SqlPersistence) {}
  async provision(request:TenantRequest,authority?:ProvisioningAuthority) {
    const {slug,name,domain,developerEmail,developerPassword,developerName}=request;
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error('Invalid tenant slug');
    if(!name.trim())throw new Error('Invalid tenant name');
    if(!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(domain) || domain!==domain.toLowerCase())
      throw new Error('Invalid tenant domain');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(developerEmail))throw new Error('Invalid developer email');
    if(developerName!==undefined&&(typeof developerName!=='string'||!developerName.trim()||developerName.length>120))throw new Error('Invalid developer name');
    if(authority&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authority.idempotencyKey))throw new Error('Invalid idempotency key');
    const passwordHash=await new AuthenticationService(this.db).hashPassword(developerPassword);
    const digest=createHash('sha256').update(JSON.stringify([slug,name,domain,developerEmail.toLowerCase(),developerPassword,developerName??''])).digest('hex');
    return this.db.transaction(async client=>{
      if(authority){
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',
          [authority.actorTenantId+':'+authority.actorUserId+':'+authority.idempotencyKey]);
        const {rows}=await client.query<{request_digest:string;slug:string;domain:string}>(`
          SELECT p.request_digest,t.slug,d.domain FROM md_tenant_provisioning_requests p
          JOIN md_tenants t ON t.id=p.target_tenant_id
          JOIN md_tenant_domains d ON d.tenant_id=t.id
          WHERE p.actor_tenant_id=$1 AND p.actor_user_id=$2 AND p.request_key=$3::uuid
        `,[authority.actorTenantId,authority.actorUserId,authority.idempotencyKey]);
        if(rows[0]){
          if(rows[0].request_digest!==digest)throw new Error('Idempotency key conflict');
          return {slug:rows[0].slug,domain:rows[0].domain,replayed:true};
        }
      }
      const existing=await client.query('SELECT id FROM md_tenants WHERE slug=$1',[slug]);
      if(existing.rowCount)throw new Error('Tenant already exists; refusing to overwrite');
      const tenant=await client.query<{id:string}>(
        'INSERT INTO md_tenants (slug,name) VALUES ($1,$2) RETURNING id',[slug,name]);
      const tenantId=tenant.rows[0].id;
      await client.query('INSERT INTO md_tenant_domains (domain,tenant_id) VALUES ($1,$2)',[domain,tenantId]);
      const user=await client.query<{id:string}>(
        'INSERT INTO md_users (tenant_id,email,password_hash,display_name,enabled) VALUES ($1,$2,$3,$4,true) RETURNING id',
        [tenantId,developerEmail.toLowerCase(),passwordHash,developerName?.trim()??'']);
      const profile=await client.query<{id:string}>(
        'INSERT INTO md_profiles(tenant_id,api_name,label) VALUES($1,$2,$3) RETURNING id',
        [tenantId,'Default','Default Profile']);
      await client.query(
        'INSERT INTO md_user_profiles(tenant_id,user_id,profile_id) VALUES($1,$2,$3)',
        [tenantId,user.rows[0].id,profile.rows[0].id]);
      const role=await client.query<{id:string}>(
        'INSERT INTO md_roles (tenant_id,api_name,label) VALUES ($1,$2,$3) RETURNING id',
        [tenantId,'TenantDeveloper','Tenant Developer']);
      const permissionSet=await client.query<{id:string}>(
        'INSERT INTO md_permission_sets (tenant_id,api_name) VALUES ($1,$2) RETURNING id',
        [tenantId,'TenantDeveloper']);
      await client.query(
        'INSERT INTO md_user_roles (tenant_id,user_id,role_id) VALUES ($1,$2,$3)',
        [tenantId,user.rows[0].id,role.rows[0].id]);
      await client.query(
        'INSERT INTO md_role_permission_sets (tenant_id,role_id,permission_set_id) VALUES ($1,$2,$3)',
        [tenantId,role.rows[0].id,permissionSet.rows[0].id]);
      // Wildcard rights are SQL policy rules, not a hardcoded developer bypass.
      await client.query(
        "INSERT INTO md_permission_rules (tenant_id,permission_set_id,resource,action,effect) VALUES ($1,$2,'*','*','allow')",
        [tenantId,permissionSet.rows[0].id]);
      // Fresh tenant catalog belongs to the same SQL transaction; business records are never seeded.
      await seedFreshCoreObjects(client,tenantId);
      await seedFreshBundledComponents(client,tenantId);
      if(authority){
        await client.query(`INSERT INTO md_tenant_provisioning_requests
          (actor_tenant_id,actor_user_id,request_key,request_digest,target_tenant_id)
          VALUES ($1,$2,$3::uuid,$4,$5)`,
          [authority.actorTenantId,authority.actorUserId,authority.idempotencyKey,digest,tenantId]);
        await client.query(`INSERT INTO md_tenant_lifecycle_audit
          (actor_tenant_id,actor_user_id,target_tenant_id,operation,previous_status,new_status)
          VALUES ($1,$2,$3,'create','NONE','ACTIVE')`,
          [authority.actorTenantId,authority.actorUserId,tenantId]);
      }
      return {slug,domain,replayed:false};
    });
  }
}
