import type { SqlPersistence } from './sql-persistence.js';
export type ComponentDefinition={api_name:string;renderer_key:string};
export class ComponentRuntime {
  constructor(private readonly db:SqlPersistence) {}
  async list(tenantId:string) {
    const {rows}=await this.db.query<{
      api_name:string;renderer_key:string;published_version:number|null;
      version:number|null;state:string|null;definition:Record<string,unknown>|null
    }>(`
      SELECT c.api_name,c.renderer_key,c.published_version,v.version,v.state,v.definition
      FROM md_component_definitions c
      LEFT JOIN md_component_versions v
        ON v.tenant_id=c.tenant_id AND v.component_id=c.id
      WHERE c.tenant_id=$1 AND c.enabled=true
      ORDER BY c.api_name,v.version DESC
    `,[tenantId]);
    const grouped=new Map<string,typeof rows>();
    for(const row of rows){
      const list=grouped.get(row.api_name)??[];
      list.push(row);grouped.set(row.api_name,list);
    }
    return [...grouped].map(([apiName,versions])=>{
      const top=versions[0];
      const active=versions.find(x=>x.state==='Published'&&x.version===top.published_version);
      const draft=versions.find(x=>x.state==='Draft');
      const selected=active??draft??top;
      const definition=selected.definition??{};
      const history=versions.filter(x=>x.state==='Published'&&x.definition)
        .map(x=>({...(x.definition??{}),version:x.version}));
      return {...definition,apiName,rendererKey:top.renderer_key,
        label:typeof definition.label==='string'?definition.label:apiName,
        description:typeof definition.description==='string'?definition.description:'',
        surfaces:Array.isArray(definition.surfaces)?definition.surfaces:[],
        jsxSource:typeof definition.jsxSource==='string'?definition.jsxSource:'',
        cssSource:typeof definition.cssSource==='string'?definition.cssSource:'',
        compiledJs:typeof definition.compiledJs==='string'?definition.compiledJs:'',
        scopedCss:typeof definition.scopedCss==='string'?definition.scopedCss:'',
        version:selected.version??1,status:active?'Published':'Draft',
        publishedVersion:top.published_version??undefined,
        trustedBundled:!selected.definition,
        revisions:history,
        ...(draft&&active?{pendingDraft:{...draft.definition,version:draft.version}}:{})
      };
    });
  }
  async resolve(tenantId:string,apiName:string):Promise<ComponentDefinition> {
    const {rows}=await this.db.query<ComponentDefinition>(
      'SELECT api_name,renderer_key FROM md_component_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true',[tenantId,apiName]);
    if(!rows[0]) throw new Error('Component not found');
    return rows[0];
  }
  // Renderers execute in the web client registry; database metadata never evaluates source code.
}
