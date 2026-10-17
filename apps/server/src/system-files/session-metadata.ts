import type {SqlPersistence} from './sql-persistence.js';

/** SQL policy -> Setup's legacy-compatible permission vocabulary.
 * No permission is granted without an effective tenant-scoped RBAC rule.
 */
export async function sessionMetadata(db:SqlPersistence,tenantId:string,userId:string) {
  const {rows}=await db.query<{capability:string;allowed:boolean;denied:boolean}>(`
    WITH requested(resource, action, capability) AS (
      VALUES
        ('ObjectDefinition','read','metadata:read'),
        ('ObjectDefinition','create','metadata:write'),
        ('Security','read','security:read'),
        ('Security','manage','security:manage'),
        ('Tenant','manage','platform:tenants:manage'),
        ('Flow','execute','flows:run'),
        ('FlowDefinition','manage','flows:manage'),
        ('Licence','manage','licence:manage')
    ), assigned AS (
      SELECT a.permission_set_id FROM md_permission_assignments a
        WHERE a.tenant_id=$1 AND a.user_id=$2
      UNION
      SELECT rp.permission_set_id FROM md_user_roles ur
        JOIN md_role_permission_sets rp ON rp.tenant_id=ur.tenant_id AND rp.role_id=ur.role_id
        WHERE ur.tenant_id=$1 AND ur.user_id=$2
    )
    SELECT q.capability,COALESCE(bool_or(r.effect='allow'),false) AS allowed,
           COALESCE(bool_or(r.effect='deny'),false) AS denied
      FROM requested q
      LEFT JOIN md_permission_rules r ON r.tenant_id=$1
        AND r.permission_set_id IN (SELECT permission_set_id FROM assigned)
        AND r.resource IN (q.resource,'*') AND r.action IN (q.action,'*')
      GROUP BY q.capability
  `,[tenantId,userId]);
  const permissions=rows.filter(r=>r.allowed===true&&r.denied!==true).map(r=>r.capability);
  return {user:{
    id:userId,userId,tenantId,profileId:'',permissions,
    fieldAccess:{} as Record<string,{read:boolean;edit:boolean}>,
    recordTypeAccess:{} as Record<string,boolean>
  }};
}
