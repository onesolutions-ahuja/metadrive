import type { SqlPersistence } from './sql-persistence.js';
export class FlowRuntime {
  constructor(private readonly db:SqlPersistence) {}
  async list(tenantId:string) {
    const {rows}=await this.db.query<{api_name:string;version:number;active:boolean}>(
      'SELECT api_name,version,active FROM md_flow_definitions WHERE tenant_id=$1 ORDER BY api_name,version DESC LIMIT 100',
      [tenantId]);
    return rows.map(row=>({apiName:row.api_name,versionNumber:row.version,status:row.active?'Active':'Draft'}));
  }
  async loadActive(tenantId:string,apiName:string) {
    const {rows}=await this.db.query<{id:string;version:number}>(
      'SELECT id,version FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2 AND active=true ORDER BY version DESC LIMIT 1',[tenantId,apiName]);
    if(!rows[0]) throw new Error('Active flow not found'); return rows[0];
  }
  async start(tenantId:string,flowApi:string,userId:string) {
    const flow=await this.loadActive(tenantId,flowApi);
    const {rows}=await this.db.query<{id:string}>(
      "INSERT INTO md_flow_runs (tenant_id,flow_id,started_by,status) VALUES ($1,$2,$3,'pending') RETURNING id",
      [tenantId,flow.id,userId]);
    return rows[0].id;
  }
  // Running a flow requires validated node definitions and a separate guarded executor.
}
