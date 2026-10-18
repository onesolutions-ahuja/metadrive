import type { SqlPersistence } from './sql-persistence.js';
export type ComponentDefinition={api_name:string;renderer_key:string};
export class ComponentRuntime {
  constructor(private readonly db:SqlPersistence) {}
  async list(tenantId:string) {
    const {rows}=await this.db.query<{
      api_name:string;renderer_key:string;published_version:number|null;
      definition:Record<string,unknown>|null;draft:Record<string,unknown>|null;draft_version:number|null
    }>(`SELECT c.api_name,c.renderer_key,c.published_version,
        pub.definition,draft.definition AS draft,draft.version AS draft_version
      FROM md_component_definitions c
      LEFT JOIN md_component_versions pub ON pub.tenant_id=c.tenant_id AND pub.component_id=c.id
       AND pub.version=c.published_version AND pub.state='Published'
      LEFT JOIN LATERAL (SELECT definition,version FROM md_component_versions
        WHERE tenant_id=c.tenant_id AND component_id=c.id AND state='Draft'
        ORDER BY version DESC LIMIT 1) draft ON true
      WHERE c.tenant_id=$1 AND c.enabled=true ORDER BY c.api_name`,[tenantId]);
    return rows.map(row=>({
      ...(row.definition??{}),apiName:row.api_name,rendererKey:row.renderer_key,
      status:row.published_version?'Published':'Draft',
      version:row.draft_version??row.published_version??0,
      publishedVersion:row.published_version??undefined,
      ...(row.draft?{pendingDraft:{...row.draft,version:row.draft_version}}:{})
    }));
  }
  async resolve(tenantId:string,apiName:string):Promise<ComponentDefinition> {
    const {rows}=await this.db.query<ComponentDefinition>(
      'SELECT api_name,renderer_key FROM md_component_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true',[tenantId,apiName]);
    if(!rows[0]) throw new Error('Component not found');
    return rows[0];
  }
  // Renderers execute in the web client registry; database metadata never evaluates source code.
}
