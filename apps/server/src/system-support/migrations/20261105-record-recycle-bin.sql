-- Phase 1: recoverable tenant-scoped record deletion (additive, idempotent).
-- This migration preserves existing records and relationships.
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS deletion_group_id uuid;
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS deletion_root_id uuid;

-- Release unique values on soft delete; restore rechecks the existing unique indexes atomically.
ALTER TABLE md_record_values ADD COLUMN IF NOT EXISTS record_is_deleted boolean NOT NULL DEFAULT false;
UPDATE md_record_values v SET record_is_deleted=r.is_deleted
 FROM md_records r WHERE v.tenant_id=r.tenant_id AND v.record_id=r.id
 AND v.record_is_deleted IS DISTINCT FROM r.is_deleted;
DROP INDEX IF EXISTS md_record_values_unique_ci;
DROP INDEX IF EXISTS md_record_values_unique_cs;
CREATE UNIQUE INDEX md_record_values_unique_ci
 ON md_record_values(tenant_id,object_api,field_api,lower(value_text))
 WHERE is_unique AND NOT case_sensitive AND value_text IS NOT NULL AND record_is_deleted=false;
CREATE UNIQUE INDEX md_record_values_unique_cs
 ON md_record_values(tenant_id,object_api,field_api,value_text)
 WHERE is_unique AND case_sensitive AND value_text IS NOT NULL AND record_is_deleted=false;

CREATE INDEX IF NOT EXISTS md_records_active_lookup
 ON md_records(tenant_id,object_api,id) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS md_records_recycle_bin
 ON md_records(tenant_id,object_api,deleted_at DESC,id) WHERE is_deleted=true;
CREATE INDEX IF NOT EXISTS md_records_deletion_group
 ON md_records(tenant_id,deletion_group_id) WHERE is_deleted=true;

-- A lookup cleared when its referenced record is deleted may be restored only
-- if the source remains active and the field has not been changed by a user.
CREATE TABLE IF NOT EXISTS md_deleted_lookup_links(
 tenant_id uuid NOT NULL,
 deletion_group_id uuid NOT NULL,
 source_record_id uuid NOT NULL,
 source_object_api text NOT NULL,
 field_api text NOT NULL,
 target_record_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,deletion_group_id,source_record_id,field_api),
 FOREIGN KEY(tenant_id,source_record_id,source_object_api)
   REFERENCES md_records(tenant_id,id,object_api) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_deleted_lookup_links_target
 ON md_deleted_lookup_links(tenant_id,deletion_group_id,target_record_id);

CREATE TABLE IF NOT EXISTS md_record_lifecycle_audit(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 record_id uuid NOT NULL,
 object_api text NOT NULL,
 deletion_group_id uuid,
 actor_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('delete','restore','purge')),
 happened_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_record_lifecycle_audit_record
 ON md_record_lifecycle_audit(tenant_id,object_api,record_id,happened_at DESC);

-- Apply the same active-record rule on upgraded tenants without replacing RBAC policy semantics.
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
 AND (CASE WHEN usr.user_type='external' THEN act='read' AND COALESCE(setting.portal_enabled,false)
   AND usr.external_account_id IS NOT NULL
   AND md_record_field(t,rec.id,setting.portal_account_field)=usr.external_account_id::text
 ELSE
 rec.owner_id=u OR (rec.owner_queue_id IS NOT NULL AND md_access_member(t,u,rec.owner_queue_id))
 OR md_rbac_allowed(t,u,'Record:'||rec.id::text,act)
 OR md_rbac_allowed(t,u,rec.object_api,'modifyAll')
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
