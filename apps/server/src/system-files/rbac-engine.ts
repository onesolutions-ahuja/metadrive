import type { SqlPersistence } from './sql-persistence.js';
export class RbacEngine {
  constructor(private readonly db:SqlPersistence) {}
  async allowed(tenantId:string,userId:string,resource:string,action:string):Promise<boolean> {
    const {rows}=await this.db.query<{allow_granted:boolean;deny_granted:boolean}>(`
      WITH assigned AS (
        SELECT a.permission_set_id FROM md_permission_assignments a
          WHERE a.tenant_id=$1 AND a.user_id=$2
        UNION
        SELECT rp.permission_set_id FROM md_user_roles ur
          JOIN md_role_permission_sets rp ON rp.tenant_id=ur.tenant_id AND rp.role_id=ur.role_id
          WHERE ur.tenant_id=$1 AND ur.user_id=$2
      )
      SELECT COALESCE(bool_or(r.effect='allow'),false) AS allow_granted,
             COALESCE(bool_or(r.effect='deny'),false) AS deny_granted
        FROM md_permission_rules r JOIN assigned a ON a.permission_set_id=r.permission_set_id
        WHERE r.tenant_id=$1 AND r.resource=$3 AND r.action=$4
    `,[tenantId,userId,resource,action]);
    return rows[0]?.allow_granted === true && rows[0]?.deny_granted !== true;
  }
  async require(tenantId:string,userId:string,resource:string,action:string) {
    if(!(await this.allowed(tenantId,userId,resource,action))) throw new Error('Permission denied');
  }
}
