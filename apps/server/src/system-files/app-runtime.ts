import type { SqlPersistence } from './sql-persistence.js';
export class AppRuntime {
  constructor(private readonly db:SqlPersistence) {}
  async install(tenantId:string,appApi:string) {
    const app=await this.db.query<{id:string}>('SELECT id FROM md_apps WHERE api_name=$1 AND enabled=true',[appApi]);
    if(!app.rows[0]) throw new Error('App unavailable');
    await this.db.query('INSERT INTO md_app_installations (tenant_id,app_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[tenantId,app.rows[0].id]);
  }
  async uninstall(tenantId:string,appApi:string) {
    await this.db.query('DELETE FROM md_app_installations WHERE tenant_id=$1 AND app_id IN (SELECT id FROM md_apps WHERE api_name=$2)',[tenantId,appApi]);
  }
  async listInstalled(tenantId:string) {
    return (await this.db.query('SELECT a.api_name,a.label FROM md_apps a JOIN md_app_installations i ON i.app_id=a.id WHERE i.tenant_id=$1',[tenantId])).rows;
  }
}
