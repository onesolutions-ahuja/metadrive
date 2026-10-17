import type {SqlPersistence} from './sql-persistence.js';
import {AuthenticationService} from './authentication.js';

export type TenantRequest={
  slug:string;
  name:string;
  domain:string;
  developerEmail:string;
  developerPassword:string;
};
export class TenantProvisioning {
  constructor(private readonly db:SqlPersistence) {}
  async provision(request:TenantRequest) {
    const {slug,name,domain,developerEmail,developerPassword}=request;
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error('Invalid tenant slug');
    if(!name.trim())throw new Error('Invalid tenant name');
    if(!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(domain) || domain!==domain.toLowerCase())
      throw new Error('Invalid tenant domain');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(developerEmail))throw new Error('Invalid developer email');
    const passwordHash=await new AuthenticationService(this.db).hashPassword(developerPassword);
    return this.db.transaction(async client=>{
      const existing=await client.query('SELECT id FROM md_tenants WHERE slug=$1',[slug]);
      if(existing.rowCount)throw new Error('Tenant already exists; refusing to overwrite');
      const tenant=await client.query<{id:string}>(
        'INSERT INTO md_tenants (slug,name) VALUES ($1,$2) RETURNING id',[slug,name]);
      const tenantId=tenant.rows[0].id;
      await client.query('INSERT INTO md_tenant_domains (domain,tenant_id) VALUES ($1,$2)',[domain,tenantId]);
      const user=await client.query<{id:string}>(
        'INSERT INTO md_users (tenant_id,email,password_hash,enabled) VALUES ($1,$2,$3,true) RETURNING id',
        [tenantId,developerEmail.toLowerCase(),passwordHash]);
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
      return {slug,domain};
    });
  }
}
