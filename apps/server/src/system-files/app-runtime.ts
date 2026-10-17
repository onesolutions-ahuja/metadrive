import type {SqlPersistence} from './sql-persistence.js';
export class AppRuntime {
  constructor(private readonly db:SqlPersistence) {}
  async install(tenantId:string,appApi:string) {
    const {rows}=await this.db.query<{id:string}>(`
      SELECT a.id FROM md_apps a
      JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=$1 AND e.active=true
        AND (e.expires_at IS NULL OR e.expires_at>now())
      WHERE a.api_name=$2 AND a.enabled=true
    `,[tenantId,appApi]);
    if(!rows[0])throw new Error('App licence or entitlement unavailable');
    await this.db.query('INSERT INTO md_app_installations (tenant_id,app_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [tenantId,rows[0].id]);
  }
  async uninstall(tenantId:string,appApi:string) {
    await this.db.query('DELETE FROM md_app_installations WHERE tenant_id=$1 AND app_id IN (SELECT id FROM md_apps WHERE api_name=$2)',
      [tenantId,appApi]);
  }
  async listInstalled(tenantId:string) {
    const {rows}=await this.db.query<{api_name:string;label:string}>(`
      SELECT a.api_name,a.label FROM md_apps a
      JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=$1
      JOIN md_app_entitlements e ON e.tenant_id=i.tenant_id AND e.app_id=a.id
      WHERE a.enabled=true AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())
      ORDER BY a.label
    `,[tenantId]);
    return rows.map(x=>({apiName:x.api_name,label:x.label}));
  }
}
