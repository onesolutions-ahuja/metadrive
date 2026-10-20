CREATE TABLE IF NOT EXISTS md_system_permission_catalogue(
 permission_key text PRIMARY KEY,label text NOT NULL,description text NOT NULL,resource text NOT NULL,action text NOT NULL
);
CREATE TABLE IF NOT EXISTS md_license_entitlements(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),id uuid NOT NULL DEFAULT gen_random_uuid(),
 license_key text NOT NULL,label text NOT NULL,kind text NOT NULL CHECK(kind IN ('User','PermissionSet')),
 enabled boolean NOT NULL DEFAULT true,seat_limit integer CHECK(seat_limit>=0),expires_at timestamptz,
 auto_assign boolean NOT NULL DEFAULT false,PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,license_key)
);
CREATE TABLE IF NOT EXISTS md_license_capabilities(
 tenant_id uuid NOT NULL,entitlement_id uuid NOT NULL,resource text NOT NULL,action text NOT NULL,
 PRIMARY KEY(tenant_id,entitlement_id,resource,action),
 FOREIGN KEY(tenant_id,entitlement_id) REFERENCES md_license_entitlements(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_user_license_assignments(
 tenant_id uuid NOT NULL,user_id uuid NOT NULL,entitlement_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,user_id,entitlement_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,entitlement_id) REFERENCES md_license_entitlements(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_permission_set_license_requirements(
 tenant_id uuid NOT NULL,permission_set_id uuid NOT NULL,entitlement_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,permission_set_id,entitlement_id),
 FOREIGN KEY(tenant_id,permission_set_id) REFERENCES md_permission_sets(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,entitlement_id) REFERENCES md_license_entitlements(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_governance_seed_receipts(tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id));
INSERT INTO md_license_entitlements(tenant_id,license_key,label,kind,auto_assign)
 SELECT id,'CoreFull','Core platform user','User',true FROM md_tenants WHERE id NOT IN(SELECT tenant_id FROM md_governance_seed_receipts) ON CONFLICT DO NOTHING;
INSERT INTO md_license_capabilities SELECT tenant_id,id,'*','*' FROM md_license_entitlements WHERE license_key='CoreFull' AND tenant_id NOT IN(SELECT tenant_id FROM md_governance_seed_receipts) ON CONFLICT DO NOTHING;
INSERT INTO md_user_license_assignments SELECT u.tenant_id,u.id,e.id FROM md_users u
 JOIN md_license_entitlements e ON e.tenant_id=u.tenant_id AND e.license_key='CoreFull' WHERE u.tenant_id NOT IN(SELECT tenant_id FROM md_governance_seed_receipts) ON CONFLICT DO NOTHING;
INSERT INTO md_governance_seed_receipts SELECT id FROM md_tenants ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION md_user_licensed(t uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM md_user_license_assignments a JOIN md_license_entitlements e ON e.tenant_id=a.tenant_id AND e.id=a.entitlement_id
  WHERE a.tenant_id=t AND a.user_id=u AND e.kind='User' AND e.enabled AND (e.expires_at IS NULL OR e.expires_at>now()))
$$;
CREATE OR REPLACE FUNCTION md_user_license_allows(t uuid,u uuid,res text,act text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM md_user_license_assignments a JOIN md_license_entitlements e ON e.tenant_id=a.tenant_id AND e.id=a.entitlement_id
  JOIN md_license_capabilities c ON c.tenant_id=e.tenant_id AND c.entitlement_id=e.id
  WHERE a.tenant_id=t AND a.user_id=u AND e.kind='User' AND e.enabled AND (e.expires_at IS NULL OR e.expires_at>now())
  AND c.resource IN(res,'*',CASE WHEN res LIKE 'Flow:%' THEN 'Flow' ELSE res END) AND c.action IN(act,'*'))
$$;
CREATE OR REPLACE FUNCTION md_permission_set_licensed(t uuid,u uuid,p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM md_permission_set_license_requirements r WHERE r.tenant_id=t AND r.permission_set_id=p AND NOT EXISTS(
  SELECT 1 FROM md_user_license_assignments a JOIN md_license_entitlements e ON e.tenant_id=a.tenant_id AND e.id=a.entitlement_id
  WHERE a.tenant_id=t AND a.user_id=u AND a.entitlement_id=r.entitlement_id AND e.kind='PermissionSet' AND e.enabled AND (e.expires_at IS NULL OR e.expires_at>now())))
$$;
CREATE OR REPLACE FUNCTION md_seed_governance_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE eid uuid;
 BEGIN
  INSERT INTO md_license_entitlements(tenant_id,license_key,label,kind,auto_assign) VALUES(NEW.id,'CoreFull','Core platform user','User',true)
   ON CONFLICT(tenant_id,license_key) DO NOTHING;
  SELECT id INTO eid FROM md_license_entitlements WHERE tenant_id=NEW.id AND license_key='CoreFull';
  INSERT INTO md_license_capabilities VALUES(NEW.id,eid,'*','*') ON CONFLICT DO NOTHING;
  INSERT INTO md_governance_seed_receipts VALUES(NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
 END
$$;
DROP TRIGGER IF EXISTS md_seed_governance_tenant ON md_tenants;
CREATE TRIGGER md_seed_governance_tenant AFTER INSERT ON md_tenants FOR EACH ROW EXECUTE FUNCTION md_seed_governance_tenant();
CREATE OR REPLACE FUNCTION md_auto_assign_user_license() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE e record;
 BEGIN
  FOR e IN SELECT * FROM md_license_entitlements WHERE tenant_id=NEW.tenant_id AND kind='User' AND auto_assign AND enabled
   AND (expires_at IS NULL OR expires_at>now()) ORDER BY id FOR UPDATE LOOP
   IF e.seat_limit IS NULL OR (SELECT count(*) FROM md_user_license_assignments WHERE tenant_id=e.tenant_id AND entitlement_id=e.id)<e.seat_limit THEN
    INSERT INTO md_user_license_assignments VALUES(NEW.tenant_id,NEW.id,e.id) ON CONFLICT DO NOTHING;
   END IF;
  END LOOP;
  RETURN NEW;
 END
$$;
DROP TRIGGER IF EXISTS md_auto_assign_user_license ON md_users;
CREATE TRIGGER md_auto_assign_user_license AFTER INSERT ON md_users FOR EACH ROW EXECUTE FUNCTION md_auto_assign_user_license();

CREATE TABLE IF NOT EXISTS md_setup_audit_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id uuid,actor_tenant_id uuid,actor_user_id uuid,
 correlation_id uuid,table_name text NOT NULL,operation text NOT NULL,row_identifier text NOT NULL,
 changed_fields text[] NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS md_setup_audit_tenant ON md_setup_audit_events(tenant_id,id DESC);
CREATE TABLE IF NOT EXISTS md_setup_audit_tables(table_name text PRIMARY KEY);
CREATE OR REPLACE FUNCTION md_capture_setup_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE before_row jsonb;after_row jsonb;row_data jsonb;fields text[];target_tenant uuid;
 BEGIN
  IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW;END IF;
  IF TG_OP<>'INSERT' THEN before_row=to_jsonb(OLD);END IF;
  IF TG_OP<>'DELETE' THEN after_row=to_jsonb(NEW);END IF;
  row_data=COALESCE(after_row,before_row);
  target_tenant=NULLIF(row_data->>'tenant_id','')::uuid;
  IF TG_TABLE_NAME='md_tenants' THEN target_tenant=(row_data->>'id')::uuid;END IF;
  SELECT array_agg(k ORDER BY k) INTO fields FROM jsonb_object_keys(row_data) k
   WHERE before_row IS NULL OR after_row IS NULL OR before_row->k IS DISTINCT FROM after_row->k;
  INSERT INTO md_setup_audit_events(tenant_id,actor_tenant_id,actor_user_id,correlation_id,table_name,operation,row_identifier,changed_fields)
  VALUES(target_tenant,NULLIF(current_setting('metadrive.actor_tenant',true),'')::uuid,NULLIF(current_setting('metadrive.actor_user',true),'')::uuid,
   NULLIF(current_setting('metadrive.correlation_id',true),'')::uuid,TG_TABLE_NAME,TG_OP,
   left(COALESCE(row_data->>'id',row_data->>'api_name',row_data->>'user_id',row_data->>'tenant_id','global'),200),COALESCE(fields,ARRAY[]::text[]));
  IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
 END
$$;
CREATE OR REPLACE FUNCTION md_protect_setup_audit() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Setup audit trail is append-only';END
$$;
DROP TRIGGER IF EXISTS md_protect_setup_audit ON md_setup_audit_events;
CREATE TRIGGER md_protect_setup_audit BEFORE UPDATE OR DELETE ON md_setup_audit_events FOR EACH ROW EXECUTE FUNCTION md_protect_setup_audit();
CREATE TABLE IF NOT EXISTS md_monitor_settings(
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id),enabled boolean NOT NULL DEFAULT true,
 retention_days integer NOT NULL DEFAULT 365 CHECK(retention_days BETWEEN 90 AND 3650)
);
CREATE TABLE IF NOT EXISTS md_monitor_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES md_tenants(id),actor_user_id uuid,
 correlation_id uuid NOT NULL,event_type text NOT NULL,resource text NOT NULL,method text NOT NULL,
 status_code integer NOT NULL,elapsed_ms integer NOT NULL,source_ip inet,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_monitor_events_tenant ON md_monitor_events(tenant_id,created_at DESC,id);
CREATE TABLE IF NOT EXISTS md_transaction_security_rules(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES md_tenants(id),label text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,event_type text NOT NULL CHECK(event_type IN ('api','metadata','login')),
 method text NOT NULL CHECK(method IN ('*','GET','POST','PUT','PATCH','DELETE')),path_prefix text NOT NULL,
 threshold integer NOT NULL DEFAULT 1 CHECK(threshold BETWEEN 1 AND 100000),window_seconds integer NOT NULL DEFAULT 60 CHECK(window_seconds BETWEEN 1 AND 86400),
 response text NOT NULL CHECK(response IN ('Block','RevokeSessions','Flow')),flow_api text,service_user_id uuid,
 UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,service_user_id) REFERENCES md_users(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_security_rule_windows(
 tenant_id uuid NOT NULL,rule_id uuid NOT NULL,user_id uuid NOT NULL,window_start timestamptz NOT NULL,count integer NOT NULL,
 PRIMARY KEY(tenant_id,rule_id,user_id),FOREIGN KEY(tenant_id,rule_id) REFERENCES md_transaction_security_rules(tenant_id,id) ON DELETE CASCADE
);

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
   AND r.action IN(act,'*') AND (r.effect='deny' OR md_permission_set_licensed(t,u,a.permission_set_id))
  UNION ALL
  SELECT 'allow',a.group_id FROM assigned a JOIN md_permission_sets p ON p.tenant_id=t AND p.id=a.permission_set_id
   WHERE act='read' AND (res LIKE 'App:%' OR res LIKE 'Tab:%') AND p.navigation_default_access='Allow' AND md_permission_set_licensed(t,u,a.permission_set_id)
 )
 SELECT md_user_license_allows(t,u,res,act) AND COALESCE(bool_or(m.effect='allow' AND (m.group_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM md_permission_group_mutes gm WHERE gm.tenant_id=t AND gm.group_id=m.group_id
   AND gm.resource IN(res,'*',CASE WHEN res LIKE 'Flow:%' THEN 'Flow' ELSE res END) AND gm.action IN(act,'*')
 ))),false) AND EXISTS(SELECT 1 FROM md_users WHERE tenant_id=t AND id=u AND enabled AND (user_type='internal' OR (act='read' AND (EXISTS(SELECT 1 FROM md_object_definitions o WHERE o.tenant_id=t AND o.api_name=res) OR EXISTS(SELECT 1 FROM md_field_definitions f WHERE f.tenant_id=t AND f.object_api||'.'||f.api_name=res) OR res LIKE 'RecordType:%')))),
 COALESCE(bool_or(m.effect='deny'),false)
 FROM matched m
$$;
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
