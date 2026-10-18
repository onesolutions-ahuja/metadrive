import {expandAppProperties} from './app-page-seeder.js';
import type { SqlPersistence } from './sql-persistence.js';
export class PageRuntime {
  constructor(private readonly db:SqlPersistence) {}
  async list(tenantId:string) {
    const {rows}=await this.db.query<{api_name:string;title:string}>(
      `SELECT api_name,title FROM md_page_definitions WHERE tenant_id=$1 AND enabled=true AND (NOT EXISTS (SELECT 1 FROM md_app_seed_pages s WHERE s.tenant_id=md_page_definitions.tenant_id AND s.page_id=md_page_definitions.id)
        OR EXISTS (SELECT 1 FROM md_app_seed_pages s JOIN md_apps a ON a.id=s.app_id AND a.enabled=true
          JOIN md_app_installations i ON i.app_id=s.app_id AND i.tenant_id=s.tenant_id
          JOIN md_app_entitlements e ON e.app_id=s.app_id AND e.tenant_id=s.tenant_id AND e.active=true
          AND (e.expires_at IS NULL OR e.expires_at>now()) WHERE s.tenant_id=md_page_definitions.tenant_id AND s.page_id=md_page_definitions.id)) ORDER BY title`,
      [tenantId]);
    return rows.map(row=>({apiName:row.api_name,label:row.title}));
  }
  async load(tenantId:string,pageApi:string) {
    const page=await this.db.query<{id:string;title:string}>(
      'SELECT id,title FROM md_page_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true',[tenantId,pageApi]);
    if(!page.rows[0]) throw new Error('Page not found');
    const owner=await this.db.query<{allowed:boolean}>(`SELECT EXISTS (
      SELECT 1 FROM md_app_installations i JOIN md_apps a ON a.id=i.app_id AND a.enabled=true
      JOIN md_app_entitlements e ON e.app_id=i.app_id AND e.tenant_id=i.tenant_id
      WHERE i.tenant_id=s.tenant_id AND i.app_id=s.app_id AND e.active=true
        AND (e.expires_at IS NULL OR e.expires_at>now())) AS allowed
      FROM md_app_seed_pages s WHERE s.tenant_id=$1 AND s.page_id=$2`,[tenantId,page.rows[0].id]);
    if(owner.rows.some(row=>!row.allowed))throw new Error('Permission denied');
    const components=await this.db.query<{id:string;component_api:string;slot:string;sort_order:number}>(
      'SELECT id,component_api,slot,sort_order FROM md_page_components WHERE tenant_id=$1 AND page_id=$2 ORDER BY sort_order',
      [tenantId,page.rows[0].id]);
    const properties=await this.db.query<{
      component_id:string;property_path:string;value_text:string|null;data_type:string;
      object_id:string|null;field_id:string|null;flow_id:string|null
    }>(`SELECT p.* FROM md_page_component_properties p JOIN md_page_components c ON c.tenant_id=p.tenant_id AND c.id=p.component_id
      WHERE c.tenant_id=$1 AND c.page_id=$2`,[tenantId,page.rows[0].id]);
    const configured=components.rows.map(c=>({...c,properties:expandAppProperties(properties.rows.filter(p=>p.component_id===c.id))}));
    return {page:{...page.rows[0],components:configured},components:configured};
  }
}
