import type { SqlPersistence } from './sql-persistence.js';
export type ComponentDefinition={api_name:string;renderer_key:string};
export class ComponentRuntime {
  constructor(private readonly db:SqlPersistence) {}
  async resolve(tenantId:string,apiName:string):Promise<ComponentDefinition> {
    const {rows}=await this.db.query<ComponentDefinition>(
      'SELECT api_name,renderer_key FROM md_component_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true',[tenantId,apiName]);
    if(!rows[0]) throw new Error('Component not found');
    return rows[0];
  }
  // Renderers execute in the web client registry; database metadata never evaluates source code.
}
