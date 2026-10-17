import type { SqlPersistence } from './sql-persistence.js';
export class PageRuntime {
  constructor(private readonly db:SqlPersistence) {}
  async load(tenantId:string,pageApi:string) {
    const page=await this.db.query<{id:string;title:string}>(
      'SELECT id,title FROM md_page_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true',[tenantId,pageApi]);
    if(!page.rows[0]) throw new Error('Page not found');
    const components=await this.db.query(
      'SELECT component_api,slot,sort_order FROM md_page_components WHERE tenant_id=$1 AND page_id=$2 ORDER BY sort_order',
      [tenantId,page.rows[0].id]);
    return {page:page.rows[0],components:components.rows};
  }
}
