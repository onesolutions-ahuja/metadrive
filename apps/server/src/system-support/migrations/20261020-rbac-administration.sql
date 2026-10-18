-- Additive relational RBAC administration. Existing grants, links and records are retained.
ALTER TABLE md_permission_sets ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE md_permission_sets ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE md_permission_sets ADD COLUMN IF NOT EXISTS license text NOT NULL DEFAULT '';
ALTER TABLE md_permission_sets ADD COLUMN IF NOT EXISTS navigation_default_access text NOT NULL DEFAULT 'Deny'
 CHECK(navigation_default_access IN ('Allow','Deny'));
ALTER TABLE md_profiles ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE md_profiles ADD COLUMN IF NOT EXISTS license text NOT NULL DEFAULT 'MetaDrive';
ALTER TABLE md_profiles ADD COLUMN IF NOT EXISTS is_standard boolean NOT NULL DEFAULT false;
-- A profile's editable rules live in an ordinary permission set, using the existing evaluator.
ALTER TABLE md_profiles ADD COLUMN IF NOT EXISTS editor_set_id uuid;
ALTER TABLE md_profiles DROP CONSTRAINT IF EXISTS md_profiles_editor_set_fk;
ALTER TABLE md_profiles ADD CONSTRAINT md_profiles_editor_set_fk
 FOREIGN KEY(tenant_id,editor_set_id) REFERENCES md_permission_sets(tenant_id,id);
CREATE TABLE IF NOT EXISTS md_rbac_revisions (
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id), revision integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS md_permission_set_groups (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),id uuid NOT NULL DEFAULT gen_random_uuid(),
 api_name text NOT NULL,label text NOT NULL,description text NOT NULL DEFAULT '',calculated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,api_name)
);
CREATE TABLE IF NOT EXISTS md_permission_group_sets (
 tenant_id uuid NOT NULL,group_id uuid NOT NULL,permission_set_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,group_id,permission_set_id),
 FOREIGN KEY(tenant_id,group_id) REFERENCES md_permission_set_groups(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,permission_set_id) REFERENCES md_permission_sets(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_permission_group_mutes (
 tenant_id uuid NOT NULL,group_id uuid NOT NULL,resource text NOT NULL,action text NOT NULL,
 PRIMARY KEY(tenant_id,group_id,resource,action),
 FOREIGN KEY(tenant_id,group_id) REFERENCES md_permission_set_groups(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_user_permission_groups (
 tenant_id uuid NOT NULL,user_id uuid NOT NULL,group_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,user_id,group_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,group_id) REFERENCES md_permission_set_groups(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_access_groups (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),id uuid NOT NULL DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('PublicGroup','Queue')),api_name text NOT NULL,label text NOT NULL,
 description text NOT NULL DEFAULT '',PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,kind,api_name)
);
CREATE TABLE IF NOT EXISTS md_access_group_members (
 tenant_id uuid NOT NULL,group_id uuid NOT NULL,member_kind text NOT NULL
 CHECK(member_kind IN ('User','Role','RoleAndSubordinates','PublicGroup')),member_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,group_id,member_kind,member_id),
 FOREIGN KEY(tenant_id,group_id) REFERENCES md_access_groups(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_queue_objects (
 tenant_id uuid NOT NULL,queue_id uuid NOT NULL,object_api text NOT NULL,
 PRIMARY KEY(tenant_id,queue_id,object_api),
 FOREIGN KEY(tenant_id,queue_id) REFERENCES md_access_groups(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name)
);
CREATE TABLE IF NOT EXISTS md_sharing_settings (
 tenant_id uuid NOT NULL,object_api text NOT NULL,default_access text NOT NULL DEFAULT 'Private'
 CHECK(default_access IN ('Private','Public Read Only','Public Read/Write')),
 use_hierarchy boolean NOT NULL DEFAULT true,portal_enabled boolean NOT NULL DEFAULT false,portal_account_field text,
 PRIMARY KEY(tenant_id,object_api),
 FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name)
);
CREATE TABLE IF NOT EXISTS md_record_policies (
 tenant_id uuid NOT NULL,id text NOT NULL,kind text NOT NULL CHECK(kind IN ('share','restriction')),
 object_api text NOT NULL,api_name text,label text,enabled boolean NOT NULL,
 rule_type text,condition_logic text NOT NULL CHECK(condition_logic IN ('all','any')),
 target_type text,target_id uuid,access_level text,subject_type text,subject_id uuid,
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name)
);
CREATE TABLE IF NOT EXISTS md_policy_owner_roles (
 tenant_id uuid NOT NULL,policy_id text NOT NULL,role_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,policy_id,role_id),
 FOREIGN KEY(tenant_id,policy_id) REFERENCES md_record_policies(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,role_id) REFERENCES md_roles(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_policy_conditions (
 tenant_id uuid NOT NULL,policy_id text NOT NULL,position integer NOT NULL,field_api text NOT NULL,
 operator text NOT NULL,value_type text NOT NULL DEFAULT 'undefined',
 PRIMARY KEY(tenant_id,policy_id,position),
 FOREIGN KEY(tenant_id,policy_id) REFERENCES md_record_policies(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_policy_condition_values (
 tenant_id uuid NOT NULL,policy_id text NOT NULL,condition_position integer NOT NULL,position integer NOT NULL,
 value_text text,PRIMARY KEY(tenant_id,policy_id,condition_position,position),
 FOREIGN KEY(tenant_id,policy_id,condition_position) REFERENCES md_policy_conditions(tenant_id,policy_id,position) ON DELETE CASCADE
);
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'UTC';
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en-GB';
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS currency_iso_code text;
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'internal' CHECK(user_type IN ('internal','external'));
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS external_account_id uuid;
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS owner_queue_id uuid;
ALTER TABLE md_records DROP CONSTRAINT IF EXISTS md_records_owner_queue_fk;
ALTER TABLE md_records ADD CONSTRAINT md_records_owner_queue_fk
 FOREIGN KEY(tenant_id,owner_queue_id) REFERENCES md_access_groups(tenant_id,id);
CREATE INDEX IF NOT EXISTS md_records_owner_lookup ON md_records(tenant_id,object_api,owner_id);
CREATE INDEX IF NOT EXISTS md_record_policies_lookup ON md_record_policies(tenant_id,object_api,kind) WHERE enabled;
CREATE INDEX IF NOT EXISTS md_access_members_lookup ON md_access_group_members(tenant_id,member_id);

-- One canonical decision function is shared by HTTP checks and SQL record filtering.
-- Group mutes suppress only group-contributed allows; an explicit deny always wins.
CREATE OR REPLACE FUNCTION md_rbac_decision(t uuid,u uuid,res text,act text)
RETURNS TABLE(allow_granted boolean,deny_granted boolean) LANGUAGE sql STABLE AS $$
 WITH assigned AS (
  SELECT permission_set_id,NULL::uuid AS group_id FROM md_permission_assignments WHERE tenant_id=t AND user_id=u
  UNION SELECT rp.permission_set_id,NULL::uuid FROM md_user_roles ur
   JOIN md_role_permission_sets rp ON rp.tenant_id=ur.tenant_id AND rp.role_id=ur.role_id
   WHERE ur.tenant_id=t AND ur.user_id=u
  UNION SELECT pp.permission_set_id,NULL::uuid FROM md_user_profiles up
   JOIN md_profile_permission_sets pp ON pp.tenant_id=up.tenant_id AND pp.profile_id=up.profile_id
   WHERE up.tenant_id=t AND up.user_id=u
  UNION SELECT gs.permission_set_id,ug.group_id FROM md_user_permission_groups ug
   JOIN md_permission_group_sets gs ON gs.tenant_id=ug.tenant_id AND gs.group_id=ug.group_id
   WHERE ug.tenant_id=t AND ug.user_id=u
 ), matched AS (
  SELECT r.effect,a.group_id FROM assigned a JOIN md_permission_rules r
   ON r.tenant_id=t AND r.permission_set_id=a.permission_set_id
   WHERE r.resource IN(res,'*',CASE WHEN res LIKE 'Flow:%' THEN 'Flow' ELSE res END)
   AND r.action IN(act,'*')
  UNION ALL
  SELECT 'allow',a.group_id FROM assigned a JOIN md_permission_sets p ON p.tenant_id=t AND p.id=a.permission_set_id
   WHERE act='read' AND (res LIKE 'App:%' OR res LIKE 'Tab:%') AND p.navigation_default_access='Allow'
 )
 SELECT COALESCE(bool_or(m.effect='allow' AND (m.group_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM md_permission_group_mutes gm WHERE gm.tenant_id=t AND gm.group_id=m.group_id
   AND gm.resource IN(res,'*',CASE WHEN res LIKE 'Flow:%' THEN 'Flow' ELSE res END) AND gm.action IN(act,'*')
 ))),false) AND EXISTS(SELECT 1 FROM md_users WHERE tenant_id=t AND id=u AND enabled AND (user_type='internal' OR (act='read' AND (EXISTS(SELECT 1 FROM md_object_definitions o WHERE o.tenant_id=t AND o.api_name=res) OR EXISTS(SELECT 1 FROM md_field_definitions f WHERE f.tenant_id=t AND f.object_api||'.'||f.api_name=res) OR res LIKE 'RecordType:%')))),
 COALESCE(bool_or(m.effect='deny'),false)
 FROM matched m
$$;
CREATE OR REPLACE FUNCTION md_rbac_allowed(t uuid,u uuid,res text,act text)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT allow_granted AND NOT deny_granted FROM md_rbac_decision(t,u,res,act)
$$;

-- The actor's roles and ancestor roles. UNION terminates even with legacy cycles.
CREATE OR REPLACE FUNCTION md_user_role_tree(t uuid,u uuid)
RETURNS TABLE(role_id uuid) LANGUAGE sql STABLE AS $$
 WITH RECURSIVE ancestors(id) AS (
  SELECT ur.role_id FROM md_user_roles ur WHERE ur.tenant_id=t AND ur.user_id=u
  UNION SELECT r.parent_role_id FROM ancestors a JOIN md_roles r ON r.tenant_id=t AND r.id=a.id WHERE r.parent_role_id IS NOT NULL
 ) SELECT id FROM ancestors
$$;
CREATE OR REPLACE FUNCTION md_access_member(t uuid,u uuid,g uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
 WITH RECURSIVE groups(id) AS (
  SELECT id FROM md_access_groups WHERE tenant_id=t AND id=g
  UNION SELECT m.member_id FROM groups x JOIN md_access_group_members m
   ON m.tenant_id=t AND m.group_id=x.id AND m.member_kind='PublicGroup'
   JOIN md_access_groups nested ON nested.tenant_id=t AND nested.id=m.member_id AND nested.kind='PublicGroup'
 )
 SELECT EXISTS(SELECT 1 FROM groups x JOIN md_access_group_members m ON m.tenant_id=t AND m.group_id=x.id
  WHERE (m.member_kind='User' AND m.member_id=u)
   OR (m.member_kind='Role' AND EXISTS(SELECT 1 FROM md_user_roles ur WHERE ur.tenant_id=t AND ur.user_id=u AND ur.role_id=m.member_id))
   OR (m.member_kind='RoleAndSubordinates' AND m.member_id IN(SELECT role_id FROM md_user_role_tree(t,u))))
$$;
CREATE OR REPLACE FUNCTION md_record_field(t uuid,r uuid,f text)
RETURNS text LANGUAGE sql STABLE AS $$
 SELECT CASE f WHEN 'Id' THEN rec.id::text WHEN 'OwnerId' THEN COALESCE(rec.owner_id,rec.owner_queue_id)::text
  WHEN 'RecordTypeId' THEN rec.record_type_id
  ELSE (SELECT COALESCE(v.reference_record_id::text,v.value_text) FROM md_record_values v
    WHERE v.tenant_id=t AND v.record_id=r AND v.field_api=f) END
 FROM md_records rec WHERE rec.tenant_id=t AND rec.id=r
$$;
CREATE OR REPLACE FUNCTION md_policy_matches(t uuid,p text,r uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
 WITH comparisons AS (
 SELECT CASE c.operator
  WHEN 'eq' THEN actual.value IS NOT DISTINCT FROM expected.value_text
  WHEN 'Equals' THEN actual.value IS NOT DISTINCT FROM expected.value_text
  WHEN 'ne' THEN actual.value IS DISTINCT FROM expected.value_text
  WHEN 'Not Equals' THEN actual.value IS DISTINCT FROM expected.value_text
  WHEN 'Contains' THEN position(expected.value_text IN actual.value)>0
  WHEN 'Starts With' THEN starts_with(actual.value,expected.value_text)
  WHEN 'Greater Than' THEN CASE WHEN actual.value ~ '^-?[0-9]+(\.[0-9]+)?$' AND expected.value_text ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN actual.value::numeric > expected.value_text::numeric ELSE false END
  WHEN 'Less Than' THEN CASE WHEN actual.value ~ '^-?[0-9]+(\.[0-9]+)?$' AND expected.value_text ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN actual.value::numeric < expected.value_text::numeric ELSE false END
  WHEN 'isNull' THEN actual.value IS NULL WHEN 'Is Null' THEN actual.value IS NULL
  WHEN 'notNull' THEN actual.value IS NOT NULL
  WHEN 'in' THEN EXISTS(SELECT 1 FROM md_policy_condition_values v WHERE v.tenant_id=t AND v.policy_id=p
     AND v.condition_position=c.position AND v.value_text IS NOT DISTINCT FROM actual.value)
  WHEN 'notIn' THEN NOT EXISTS(SELECT 1 FROM md_policy_condition_values v WHERE v.tenant_id=t AND v.policy_id=p
     AND v.condition_position=c.position AND v.value_text IS NOT DISTINCT FROM actual.value)
  ELSE false END AS ok
 FROM md_policy_conditions c
 CROSS JOIN LATERAL(SELECT md_record_field(t,r,c.field_api) AS value) actual
 LEFT JOIN md_policy_condition_values expected ON expected.tenant_id=t AND expected.policy_id=p
   AND expected.condition_position=c.position AND expected.position=0
 WHERE c.tenant_id=t AND c.policy_id=p
 )
 SELECT COALESCE(CASE WHEN policy.condition_logic='all' THEN (SELECT bool_and(COALESCE(ok,false)) FROM comparisons)
  ELSE (SELECT bool_or(COALESCE(ok,false)) FROM comparisons) END,false)
 FROM md_record_policies policy WHERE policy.tenant_id=t AND policy.id=p
$$;
CREATE OR REPLACE FUNCTION md_record_access(t uuid,u uuid,rid uuid,act text)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT COALESCE((
 SELECT
 -- Object/record denies and restrictions also narrow ownership and broad grants.
 NOT (SELECT deny_granted FROM md_rbac_decision(t,u,'Record:'||rec.id::text,act))
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
