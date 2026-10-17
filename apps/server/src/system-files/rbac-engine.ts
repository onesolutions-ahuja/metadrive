import type { SqlPersistence } from './sql-persistence.js';
export class RbacEngine {
  constructor(private readonly db: SqlPersistence) {}
  async allowed(tenantId:string,userId:string,resource:string,action:string):Promise<boolean> {
    const {rows}=await this.db.query<{ok:boolean}>(`
      SELECT EXISTS (
        SELECT 1 FROM md_permission_assignments a
        JOIN md_permission_rules r ON r.tenant_id=a.tenant_id AND r.permission_set_id=a.permission_set_id
        WHERE a.tenant_id=$1 AND a.user_id=$2 AND r.resource=$3 AND r.action=$4 AND r.effect='allow'
      ) AS ok`,[tenantId,userId,resource,action]);
    return rows[0]?.ok === true;
  }
  async require(tenantId:string,userId:string,resource:string,action:string) {
    if (!(await this.allowed(tenantId,userId,resource,action))) throw new Error('Permission denied');
  }
}
