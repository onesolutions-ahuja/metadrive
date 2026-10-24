-- Optional reporting-based record visibility; independent of role hierarchy.
CREATE TABLE IF NOT EXISTS md_permission_data_scopes (
 tenant_id uuid NOT NULL,
 permission_set_id uuid NOT NULL,
 object_api text NOT NULL,
 scope text NOT NULL CHECK(scope IN ('all','descendants','own')),
 PRIMARY KEY(tenant_id,permission_set_id,object_api),
 FOREIGN KEY(tenant_id,permission_set_id) REFERENCES md_permission_sets(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name)
);
CREATE INDEX IF NOT EXISTS md_permission_data_scopes_object_idx ON md_permission_data_scopes(tenant_id,object_api);

-- Any applicable permission set may grant a reporting scope. 'all' is the
-- broadest, followed by descendants, then own. A missing scope keeps existing
-- legacy record sharing. No role/position relation is used to calculate teams.
CREATE OR REPLACE FUNCTION md_effective_reporting_scope(t uuid, actor uuid, obj text)
RETURNS text LANGUAGE sql STABLE AS $$
 WITH assigned AS (
  SELECT a.permission_set_id,NULL::uuid AS group_id
    FROM md_permission_assignments a WHERE a.tenant_id=t AND a.user_id=actor
  UNION
  SELECT p.permission_set_id,NULL::uuid FROM md_user_profiles up
    JOIN md_profile_permission_sets p ON p.tenant_id=up.tenant_id AND p.profile_id=up.profile_id
    WHERE up.tenant_id=t AND up.user_id=actor
  UNION
  SELECT p.permission_set_id,NULL::uuid FROM md_user_roles ur
    JOIN md_role_permission_sets p ON p.tenant_id=ur.tenant_id AND p.role_id=ur.role_id
    WHERE ur.tenant_id=t AND ur.user_id=actor
  UNION
  SELECT gs.permission_set_id,ug.group_id FROM md_user_permission_groups ug
    JOIN md_permission_group_sets gs ON gs.tenant_id=ug.tenant_id AND gs.group_id=ug.group_id
    WHERE ug.tenant_id=t AND ug.user_id=actor
 ), effective AS (
  SELECT s.scope FROM assigned a JOIN md_permission_data_scopes s
    ON s.tenant_id=t AND s.permission_set_id=a.permission_set_id AND s.object_api=obj
    WHERE a.group_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM md_permission_group_mutes m
      WHERE m.tenant_id=t AND m.group_id=a.group_id
       AND m.resource IN(obj,'*') AND m.action IN('read','*'))
 )
 SELECT CASE WHEN bool_or(scope='all') THEN 'all'
   WHEN bool_or(scope='descendants') THEN 'descendants'
   WHEN bool_or(scope='own') THEN 'own' ELSE NULL END
 FROM effective;
$$;

-- Reuse the latest system governance record-access function. Scope enforcement
-- surrounds every existing sharing grant while preserving denials and restrictions.
CREATE OR REPLACE FUNCTION md_record_access(t uuid,u uuid,rid uuid,act text)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT COALESCE((
 SELECT
 -- Object/record denies and restrictions also narrow ownership and broad grants.
 (NOT rec.is_deleted OR act='delete')
 AND NOT (SELECT deny_granted FROM md_rbac_decision(t,u,'Record:'||rec.id::text,act))
 AND md_rbac_allowed(t,u,rec.object_api,act)
 AND (rec.record_type_id IS NULL OR md_rbac_allowed(t,u,'RecordType:'||rec.object_api||'.'||rec.record_type_id,'read'))
 AND NOT EXISTS(SELECT 1 FROM md_record_policies rp WHERE rp.tenant_id=t AND rp.object_api=rec.object_api
  AND rp.kind='restriction' AND rp.enabled
  AND (rp.subject_type='all' OR (rp.subject_type='external' AND usr.user_type='external')
   OR (rp.subject_type='user' AND rp.subject_id=u) OR (rp.subject_type='role' AND EXISTS(
    SELECT 1 FROM md_user_roles ur WHERE ur.tenant_id=t AND ur.user_id=u AND ur.role_id=rp.subject_id)))
  AND NOT md_policy_matches(t,rp.id,rec.id))
 AND (usr.user_type='external'
      OR md_effective_reporting_scope(t,u,rec.object_api) IS NULL
      OR md_effective_reporting_scope(t,u,rec.object_api)='all'
      OR (rec.owner_id IS NOT NULL AND md_reporting_scope(t,u,rec.owner_id,
           md_effective_reporting_scope(t,u,rec.object_api))))
 AND (CASE WHEN usr.user_type='external' THEN act='read' AND COALESCE(setting.portal_enabled,false)
   AND usr.external_account_id IS NOT NULL
   AND md_record_field(t,rec.id,setting.portal_account_field)=usr.external_account_id::text
 ELSE
 (md_effective_reporting_scope(t,u,rec.object_api) IS NOT NULL
  AND (md_effective_reporting_scope(t,u,rec.object_api)='all'
    OR (rec.owner_id IS NOT NULL AND md_reporting_scope(t,u,rec.owner_id,
       md_effective_reporting_scope(t,u,rec.object_api)))))
 OR rec.owner_id=u OR (rec.owner_queue_id IS NOT NULL AND md_access_member(t,u,rec.owner_queue_id))
 OR md_rbac_allowed(t,u,'Record:'||rec.id::text,act)
 OR md_rbac_allowed(t,u,rec.object_api,'modifyAll') OR md_rbac_allowed(t,u,'Record','modifyAll')
 OR (act='read' AND (md_rbac_allowed(t,u,rec.object_api,'viewAll') OR md_rbac_allowed(t,u,'Record','viewAll')))
 OR (act='read' AND setting.default_access IN ('Public Read Only','Public Read/Write'))
 OR (act='edit' AND setting.default_access='Public Read/Write')
 OR (COALESCE(setting.use_hierarchy,true) AND EXISTS(
   SELECT 1 FROM md_user_role_tree(t,rec.owner_id) ancestor
   JOIN md_user_roles ur ON ur.tenant_id=t AND ur.user_id=u AND ur.role_id=ancestor.role_id
   WHERE NOT EXISTS(SELECT 1 FROM md_user_roles own WHERE own.tenant_id=t AND own.user_id=rec.owner_id AND own.role_id=ancestor.role_id)))
 OR (act IN ('read','edit') AND EXISTS(SELECT 1 FROM md_record_policies rp
  WHERE rp.tenant_id=t AND rp.object_api=rec.object_api AND rp.kind='share' AND rp.enabled
   AND (act='read' OR rp.access_level='Edit')
   AND (CASE rp.target_type WHEN 'User' THEN rp.target_id=u
    WHEN 'PublicGroup' THEN md_access_member(t,u,rp.target_id)
    WHEN 'Role' THEN EXISTS(SELECT 1 FROM md_user_roles ur WHERE ur.tenant_id=t AND ur.user_id=u AND ur.role_id=rp.target_id)
    WHEN 'RoleAndSubordinates' THEN rp.target_id IN(SELECT role_id FROM md_user_role_tree(t,u)) ELSE false END)
   AND (CASE rp.rule_type WHEN 'OwnerBased' THEN EXISTS(
    SELECT 1 FROM md_policy_owner_roles por JOIN md_user_roles own
     ON own.tenant_id=por.tenant_id AND own.role_id=por.role_id AND own.user_id=rec.owner_id
     WHERE por.tenant_id=t AND por.policy_id=rp.id)
    WHEN 'CriteriaBased' THEN md_policy_matches(t,rp.id,rec.id) ELSE false END)))
 END)
 FROM md_records rec JOIN md_users usr ON usr.tenant_id=t AND usr.id=u AND usr.enabled
 LEFT JOIN md_sharing_settings setting ON setting.tenant_id=t AND setting.object_api=rec.object_api
 WHERE rec.tenant_id=t AND rec.id=rid
 ),false)
$$;

-- Existing tenant metadata: additive field backfill without changing layouts.
INSERT INTO md_field_definitions(tenant_id,object_api,api_name,label,data_type,related_object,required)
SELECT o.tenant_id,'User','ReportsToId','Reports To','reference','User',false
FROM md_object_definitions o WHERE o.api_name='User'
ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING;
