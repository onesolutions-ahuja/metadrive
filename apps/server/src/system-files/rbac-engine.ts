import type { SqlPersistence } from './sql-persistence.js';

export type PermissionCheck = {resource:string;action:string};

/** Single OneEngine SQL permission evaluator: tenant, user, explicit deny and wildcard. */
export class RbacEngine {
  constructor(private readonly db:SqlPersistence) {}
  async allowedMany(tenantId:string,userId:string,checks:readonly PermissionCheck[]):Promise<boolean[]> {
    if(!checks.length)return [];
    const {rows}=await this.db.query<{ordinal:number;allow_granted:boolean;deny_granted:boolean}>(`
      WITH assigned AS (
        SELECT a.permission_set_id FROM md_permission_assignments a
          WHERE a.tenant_id=$1 AND a.user_id=$2
        UNION
        SELECT rp.permission_set_id FROM md_user_roles ur
          JOIN md_role_permission_sets rp ON rp.tenant_id=ur.tenant_id AND rp.role_id=ur.role_id
          WHERE ur.tenant_id=$1 AND ur.user_id=$2
      ), requested AS (
        SELECT resource,action,ordinal
          FROM unnest($3::text[], $4::text[]) WITH ORDINALITY AS q(resource,action,ordinal)
      )
      SELECT q.ordinal::integer AS ordinal,
        COALESCE(bool_or(r.effect='allow'),false) AS allow_granted,
        COALESCE(bool_or(r.effect='deny'),false) AS deny_granted
      FROM requested q
      LEFT JOIN md_permission_rules r ON r.tenant_id=$1
        AND r.permission_set_id IN (SELECT permission_set_id FROM assigned)
        AND r.resource IN (q.resource,'*') AND r.action IN (q.action,'*')
      GROUP BY q.ordinal ORDER BY q.ordinal
    `,[tenantId,userId,checks.map(c=>c.resource),checks.map(c=>c.action)]);
    const byIndex=new Map(rows.map(row=>[Number(row.ordinal)-1,row]));
    return checks.map((_,i)=>{
      const row=byIndex.get(i);
      return row?.allow_granted===true && row?.deny_granted!==true;
    });
  }
  async allowed(tenantId:string,userId:string,resource:string,action:string):Promise<boolean> {
    return (await this.allowedMany(tenantId,userId,[{resource,action}]))[0];
  }
  async require(tenantId:string,userId:string,resource:string,action:string) {
    if(!(await this.allowed(tenantId,userId,resource,action))) throw new Error('Permission denied');
  }
}
