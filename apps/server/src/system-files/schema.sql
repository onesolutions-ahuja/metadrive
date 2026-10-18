-- Fresh, isolated system runtime schema. No legacy tables or JSON state imports.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS md_tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name text NOT NULL);
CREATE TABLE IF NOT EXISTS md_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), email text NOT NULL, password_hash text NOT NULL, enabled boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,id));
CREATE UNIQUE INDEX IF NOT EXISTS md_users_email_per_tenant ON md_users (tenant_id,lower(email));
CREATE TABLE IF NOT EXISTS md_tenant_domains (domain text PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES md_tenants(id), CHECK (domain=lower(domain)));
CREATE TABLE IF NOT EXISTS md_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), user_id uuid NOT NULL, FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id), token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz);
CREATE TABLE IF NOT EXISTS md_refresh_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), user_id uuid NOT NULL, FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id), token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz);
CREATE TABLE IF NOT EXISTS md_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES md_tenants(id),api_name text NOT NULL,label text NOT NULL,parent_role_id uuid, UNIQUE(tenant_id,api_name), UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,parent_role_id) REFERENCES md_roles(tenant_id,id));
CREATE TABLE IF NOT EXISTS md_user_roles (tenant_id uuid NOT NULL REFERENCES md_tenants(id),user_id uuid NOT NULL,role_id uuid NOT NULL,FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id), FOREIGN KEY(tenant_id,role_id) REFERENCES md_roles(tenant_id,id),PRIMARY KEY(tenant_id,user_id,role_id));
CREATE TABLE IF NOT EXISTS md_permission_sets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), api_name text NOT NULL, UNIQUE(tenant_id,api_name), UNIQUE(tenant_id,id));
CREATE TABLE IF NOT EXISTS md_permission_assignments (tenant_id uuid NOT NULL REFERENCES md_tenants(id), user_id uuid NOT NULL, permission_set_id uuid NOT NULL, FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id), FOREIGN KEY(tenant_id,permission_set_id) REFERENCES md_permission_sets(tenant_id,id), PRIMARY KEY(tenant_id,user_id,permission_set_id));
CREATE TABLE IF NOT EXISTS md_role_permission_sets (tenant_id uuid NOT NULL REFERENCES md_tenants(id),role_id uuid NOT NULL, permission_set_id uuid NOT NULL, FOREIGN KEY(tenant_id,role_id) REFERENCES md_roles(tenant_id,id), FOREIGN KEY(tenant_id,permission_set_id) REFERENCES md_permission_sets(tenant_id,id), PRIMARY KEY(tenant_id,role_id,permission_set_id));
CREATE TABLE IF NOT EXISTS md_permission_rules (tenant_id uuid NOT NULL REFERENCES md_tenants(id), permission_set_id uuid NOT NULL, FOREIGN KEY(tenant_id,permission_set_id) REFERENCES md_permission_sets(tenant_id,id), resource text NOT NULL, action text NOT NULL, effect text NOT NULL CHECK (effect IN ('allow','deny')), PRIMARY KEY(tenant_id,permission_set_id,resource,action));
CREATE TABLE IF NOT EXISTS md_object_definitions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), api_name text NOT NULL, label text NOT NULL, is_system boolean NOT NULL DEFAULT false, UNIQUE(tenant_id,api_name));
CREATE TABLE IF NOT EXISTS md_field_definitions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), object_api text NOT NULL, api_name text NOT NULL, label text, data_type text NOT NULL, related_object text, max_length integer CHECK (max_length BETWEEN 1 AND 1000000), required boolean NOT NULL DEFAULT false, UNIQUE(tenant_id,object_api,api_name), UNIQUE(tenant_id,object_api,id), FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name), FOREIGN KEY(tenant_id,related_object) REFERENCES md_object_definitions(tenant_id,api_name));
CREATE TABLE IF NOT EXISTS md_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), object_api text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,object_api), FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name));
CREATE TABLE IF NOT EXISTS md_record_values (tenant_id uuid NOT NULL REFERENCES md_tenants(id), record_id uuid NOT NULL, object_api text NOT NULL, field_api text NOT NULL, value_text text, reference_record_id uuid, PRIMARY KEY(tenant_id,record_id,field_api), FOREIGN KEY(tenant_id,record_id,object_api) REFERENCES md_records(tenant_id,id,object_api) ON DELETE CASCADE, FOREIGN KEY(tenant_id,object_api,field_api) REFERENCES md_field_definitions(tenant_id,object_api,api_name), FOREIGN KEY(tenant_id,reference_record_id) REFERENCES md_records(tenant_id,id));
CREATE TABLE IF NOT EXISTS md_component_definitions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), api_name text NOT NULL, renderer_key text NOT NULL, enabled boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,api_name), UNIQUE(tenant_id,id));
CREATE TABLE IF NOT EXISTS md_page_definitions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), api_name text NOT NULL, title text NOT NULL, enabled boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,api_name), UNIQUE(tenant_id,id));
CREATE TABLE IF NOT EXISTS md_page_components (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), page_id uuid NOT NULL, component_api text NOT NULL, FOREIGN KEY(tenant_id,page_id) REFERENCES md_page_definitions(tenant_id,id), FOREIGN KEY(tenant_id,component_api) REFERENCES md_component_definitions(tenant_id,api_name), slot text NOT NULL, sort_order integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS md_flow_definitions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), api_name text NOT NULL, label text, flow_type text NOT NULL DEFAULT 'Autolaunched Flow', version integer NOT NULL, active boolean NOT NULL DEFAULT false, UNIQUE(tenant_id,api_name,version), UNIQUE(tenant_id,id));
CREATE TABLE IF NOT EXISTS md_flow_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), flow_id uuid NOT NULL, started_by uuid NOT NULL, FOREIGN KEY(tenant_id,flow_id) REFERENCES md_flow_definitions(tenant_id,id), FOREIGN KEY(tenant_id,started_by) REFERENCES md_users(tenant_id,id), status text NOT NULL CHECK(status IN ('pending','completed','failed','cancelled')), UNIQUE(tenant_id,id), started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,error_code text);
CREATE TABLE IF NOT EXISTS md_apps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), api_name text NOT NULL UNIQUE, label text NOT NULL, enabled boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS md_app_installations (tenant_id uuid NOT NULL REFERENCES md_tenants(id), app_id uuid NOT NULL REFERENCES md_apps(id), PRIMARY KEY(tenant_id,app_id));

-- Relational component/page/flow properties; values never execute server-side code.
CREATE TABLE IF NOT EXISTS md_component_properties (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id), component_id uuid NOT NULL, FOREIGN KEY(tenant_id,component_id) REFERENCES md_component_definitions(tenant_id,id) ON DELETE CASCADE,
 api_name text NOT NULL, value_text text, data_type text NOT NULL DEFAULT 'text', PRIMARY KEY(tenant_id,component_id,api_name)
);
CREATE TABLE IF NOT EXISTS md_page_properties (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id), page_id uuid NOT NULL, FOREIGN KEY(tenant_id,page_id) REFERENCES md_page_definitions(tenant_id,id) ON DELETE CASCADE,
 api_name text NOT NULL, value_text text, PRIMARY KEY(tenant_id,page_id,api_name)
);
CREATE TABLE IF NOT EXISTS md_flow_nodes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 flow_id uuid NOT NULL, FOREIGN KEY(tenant_id,flow_id) REFERENCES md_flow_definitions(tenant_id,id) ON DELETE CASCADE,
 api_name text NOT NULL,node_type text NOT NULL,sort_order integer NOT NULL DEFAULT 0, UNIQUE(tenant_id,id), UNIQUE(tenant_id,flow_id,api_name)
);
CREATE TABLE IF NOT EXISTS md_flow_edges (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),flow_id uuid NOT NULL, FOREIGN KEY(tenant_id,flow_id) REFERENCES md_flow_definitions(tenant_id,id) ON DELETE CASCADE,
 source_api text NOT NULL,target_api text NOT NULL,outcome text NOT NULL DEFAULT 'default',
 PRIMARY KEY(tenant_id,flow_id,source_api,outcome)
);
CREATE TABLE IF NOT EXISTS md_app_entitlements (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),app_id uuid NOT NULL REFERENCES md_apps(id),
 active boolean NOT NULL DEFAULT false, expires_at timestamptz,
 PRIMARY KEY(tenant_id,app_id)
);

-- SQL app-specific Home Page assignment. Null assignment is represented by no row.
CREATE TABLE IF NOT EXISTS md_app_home_pages (
  tenant_id uuid NOT NULL REFERENCES md_tenants(id),
  app_id uuid NOT NULL REFERENCES md_apps(id),
  form_factor text NOT NULL CHECK (form_factor IN ('desktop','tablet','phone')),
  page_id uuid NOT NULL,
  PRIMARY KEY (tenant_id,app_id,form_factor),
  FOREIGN KEY(tenant_id,app_id) REFERENCES md_app_installations(tenant_id,app_id),
  FOREIGN KEY(tenant_id,page_id) REFERENCES md_page_definitions(tenant_id,id)
);

CREATE TABLE IF NOT EXISTS md_flow_node_properties (
  tenant_id uuid NOT NULL REFERENCES md_tenants(id),
  node_id uuid NOT NULL,
  api_name text NOT NULL,
  value_text text,
  data_type text NOT NULL CHECK(data_type IN ('text','string','number','boolean','null')),
  PRIMARY KEY(tenant_id,node_id,api_name),
  FOREIGN KEY(tenant_id,node_id) REFERENCES md_flow_nodes(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_flow_run_inputs (
  tenant_id uuid NOT NULL REFERENCES md_tenants(id),
  run_id uuid NOT NULL,
  api_name text NOT NULL,
  value_text text,
  data_type text NOT NULL CHECK(data_type IN ('text','string','number','boolean','null')),
  PRIMARY KEY(tenant_id,run_id,api_name),
  FOREIGN KEY(tenant_id,run_id) REFERENCES md_flow_runs(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS md_bootstrap_password_repairs (tenant_id uuid NOT NULL, user_id uuid NOT NULL, reconciled_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,user_id), FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id));

CREATE TABLE IF NOT EXISTS md_initial_password_rotations (tenant_id uuid NOT NULL, user_id uuid NOT NULL, rotated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,user_id), FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id));
-- Stable references remain tenant-scoped even when API names change.
CREATE UNIQUE INDEX IF NOT EXISTS md_object_definition_tenant_id ON md_object_definitions(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS md_field_definition_tenant_id ON md_field_definitions(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS md_page_component_tenant_id ON md_page_components(tenant_id,id);
CREATE TABLE IF NOT EXISTS md_page_component_properties (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id), component_id uuid NOT NULL,
 property_path text NOT NULL, value_text text,
 data_type text NOT NULL CHECK(data_type IN ('string','number','boolean','null','reference','array','object')),
 object_id uuid,field_id uuid,flow_id uuid,
 PRIMARY KEY(tenant_id,component_id,property_path),
 FOREIGN KEY(tenant_id,component_id) REFERENCES md_page_components(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,object_id) REFERENCES md_object_definitions(tenant_id,id),
 FOREIGN KEY(tenant_id,field_id) REFERENCES md_field_definitions(tenant_id,id),
 FOREIGN KEY(tenant_id,flow_id) REFERENCES md_flow_definitions(tenant_id,id),
 CHECK((data_type='reference' AND num_nonnulls(object_id,field_id,flow_id)=1 AND value_text IS NULL)
  OR (data_type<>'reference' AND num_nonnulls(object_id,field_id,flow_id)=0))
);
CREATE TABLE IF NOT EXISTS md_app_seed_pages (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),app_id uuid NOT NULL REFERENCES md_apps(id),seed_key text NOT NULL,
 page_id uuid NOT NULL,component_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),
 PRIMARY KEY(tenant_id,app_id,seed_key),
 FOREIGN KEY(tenant_id,page_id) REFERENCES md_page_definitions(tenant_id,id),
 FOREIGN KEY(tenant_id,component_id) REFERENCES md_page_components(tenant_id,id)
);

-- Run by the versioned SQL migration runner before enabling the new routes.
-- Shared metadata for optional runtime definitions. Never stores credentials or secrets.
CREATE TABLE IF NOT EXISTS md_system_definitions (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 kind text NOT NULL CHECK (kind IN ('platform-events','email-alerts','approval-processes','dashboards','dashboard-folders','dashboard-territories','report-folders','reports','connector-providers','integration-connections')),
 api_name text NOT NULL,
 label text NOT NULL,
 properties jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(properties)='object'),
 enabled boolean NOT NULL DEFAULT true,
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,kind,api_name)
);
CREATE INDEX IF NOT EXISTS md_system_definitions_lookup ON md_system_definitions(tenant_id,kind,enabled);

-- Isolated encrypted credential storage. The SQL record never contains plaintext secrets.
CREATE TABLE IF NOT EXISTS md_named_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 name text NOT NULL,
 label text NOT NULL,
 protocol text NOT NULL CHECK(protocol IN ('HTTPS','SMTP')),
 base_url text NOT NULL,
 auth_type text NOT NULL,
 header_name text NOT NULL DEFAULT '',
 secret_ciphertext bytea,
 configuration_ciphertext bytea,
 enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,name),UNIQUE(tenant_id,id)
);

-- Tenant-level settings persisted independently from Core metadata.
CREATE TABLE IF NOT EXISTS md_tenant_settings (tenant_id uuid NOT NULL REFERENCES md_tenants(id), setting_key text NOT NULL CHECK (setting_key IN ('company-profile','currencies','automation-settings')), properties jsonb NOT NULL CHECK (jsonb_typeof(properties)='object'),revision integer NOT NULL DEFAULT 1 CHECK (revision>0),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,setting_key));

-- Fresh-install tenant lifecycle fields mirror the additive migration.
ALTER TABLE md_tenants ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE md_tenants ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','ARCHIVED'));
ALTER TABLE md_tenants ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE md_tenants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE md_tenants ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE md_tenants ADD COLUMN IF NOT EXISTS retention_until timestamptz;
ALTER TABLE md_tenants ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS md_tenant_lifecycle_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_tenant_id uuid NOT NULL REFERENCES md_tenants(id),actor_user_id uuid NOT NULL,target_tenant_id uuid NOT NULL REFERENCES md_tenants(id),operation text NOT NULL,previous_status text NOT NULL,new_status text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(actor_tenant_id,actor_user_id) REFERENCES md_users(tenant_id,id));
CREATE INDEX IF NOT EXISTS md_tenant_lifecycle_audit_target ON md_tenant_lifecycle_audit(target_tenant_id,created_at DESC);

ALTER TABLE md_users ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS md_tenant_provisioning_requests (actor_tenant_id uuid NOT NULL REFERENCES md_tenants(id),actor_user_id uuid NOT NULL,request_key uuid NOT NULL,request_digest text NOT NULL,target_tenant_id uuid NOT NULL REFERENCES md_tenants(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_tenant_id,actor_user_id,request_key),FOREIGN KEY(actor_tenant_id,actor_user_id) REFERENCES md_users(tenant_id,id));

-- Versioned, tenant-bound route aliases for installed apps.
CREATE TABLE IF NOT EXISTS md_app_route_aliases (tenant_id uuid NOT NULL REFERENCES md_tenants(id), app_api text NOT NULL REFERENCES md_apps(api_name), slug text NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]{0,61}[a-z0-9]$'), kind text NOT NULL CHECK (kind IN ('App Home','App Page','Record List')), target_api text NOT NULL, status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Disabled')), version integer NOT NULL DEFAULT 1 CHECK (version>=1), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,app_api,slug));

-- Fresh installs use the same durable notification structure as additive migrations.
CREATE TABLE IF NOT EXISTS md_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 recipient_id uuid NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '',
 flow_api_name text NOT NULL DEFAULT '', sent_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz, FOREIGN KEY(tenant_id,recipient_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,sent_by) REFERENCES md_users(tenant_id,id), UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_notifications_inbox ON md_notifications(tenant_id,recipient_id,created_at DESC);

-- Tenant-safe durable approval requests. Decisions are atomic and auditable.
CREATE TABLE IF NOT EXISTS md_approval_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 group_id uuid NOT NULL DEFAULT gen_random_uuid(),
 object_api text NOT NULL,
 object_label text NOT NULL,
 record_id uuid NOT NULL,
 record_name text NOT NULL,
 flow_api_name text NOT NULL,
 submitted_by uuid NOT NULL,
 approver_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected','Canceled')),
 comments text NOT NULL DEFAULT '',
 decision_comments text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 decided_by uuid,
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,record_id,object_api) REFERENCES md_records(tenant_id,id,object_api),
 FOREIGN KEY(tenant_id,submitted_by) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,approver_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,decided_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_approval_requests_inbox ON md_approval_requests(tenant_id,approver_id,status,created_at DESC);

ALTER TABLE md_records ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS md_record_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 object_api text NOT NULL,record_id uuid NOT NULL,created_by uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('Task','Call','Event')),subject text NOT NULL,
 description text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Completed')),
 due_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,record_id,object_api) REFERENCES md_records(tenant_id,id,object_api),
 FOREIGN KEY(tenant_id,created_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_record_activities_record ON md_record_activities(tenant_id,object_api,record_id,created_at DESC);
CREATE TABLE IF NOT EXISTS md_record_chatter_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 object_api text NOT NULL,record_id uuid NOT NULL,created_by uuid NOT NULL,
 body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,record_id,object_api) REFERENCES md_records(tenant_id,id,object_api),
 FOREIGN KEY(tenant_id,created_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_record_chatter_record ON md_record_chatter_posts(tenant_id,object_api,record_id,created_at DESC);
CREATE TABLE IF NOT EXISTS md_record_chatter_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 post_id uuid NOT NULL,created_by uuid NOT NULL,body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,post_id) REFERENCES md_record_chatter_posts(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_record_chatter_comments_post ON md_record_chatter_comments(tenant_id,post_id,created_at);

CREATE TABLE IF NOT EXISTS md_password_recovery_settings (
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id),
 smtp_credential_id uuid,
 from_email text NOT NULL DEFAULT '',
 policy jsonb NOT NULL DEFAULT '{"method":"OTP","defaultChannel":"email","allowedChannels":["email"]}'::jsonb
   CHECK (jsonb_typeof(policy)='object'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,smtp_credential_id) REFERENCES md_named_credentials(tenant_id,id)
);

ALTER TABLE md_users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
CREATE TABLE IF NOT EXISTS md_security_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 actor_user_id uuid NOT NULL,
 action text NOT NULL,
 subject_user_id uuid,
 details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,actor_user_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,subject_user_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_security_events_tenant_created ON md_security_events(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS md_record_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 record_id uuid NOT NULL,
 object_api text NOT NULL,
 field_api text NOT NULL,
 changed_by uuid NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 old_value text,
 new_value text,
 FOREIGN KEY(tenant_id,record_id,object_api) REFERENCES md_records(tenant_id,id,object_api) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,changed_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_record_history_lookup ON md_record_history(tenant_id,object_api,record_id,changed_at DESC);

CREATE TABLE IF NOT EXISTS md_dashboard_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 dashboard_api text NOT NULL,
 created_by uuid NOT NULL,
 label text NOT NULL,
 frequency text NOT NULL CHECK(frequency IN ('Daily','Weekly')),
 local_time text NOT NULL,
 time_zone text NOT NULL,
 day_of_week integer CHECK(day_of_week BETWEEN 0 AND 6),
 recipient_user_ids uuid[] NOT NULL DEFAULT '{}',
 named_credential_id uuid,
 from_email text NOT NULL DEFAULT '',
 active boolean NOT NULL DEFAULT false,
 save_snapshots boolean NOT NULL DEFAULT false,
 next_run_at timestamptz NOT NULL,
 last_run_at timestamptz,
 last_run_status text NOT NULL DEFAULT 'Never' CHECK(last_run_status IN ('Never','Success','Failed')),
 last_run_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,created_by) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,named_credential_id) REFERENCES md_named_credentials(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_dashboard_subscriptions_due ON md_dashboard_subscriptions(tenant_id,active,next_run_at);

CREATE TABLE IF NOT EXISTS md_tenant_mfa_policies (
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id),
 mode text NOT NULL DEFAULT 'Off' CHECK(mode IN ('Off','Optional','Required')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS md_user_mfa (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 user_id uuid NOT NULL,
 secret_encrypted bytea NOT NULL,
 key_id text NOT NULL,
 last_counter bigint NOT NULL DEFAULT -1,
 enrolled_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_mfa_challenges (
 token_hash text PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 user_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('login','enroll')),
 enrollment_required boolean NOT NULL DEFAULT false,
 secret_encrypted bytea,
 key_id text,
 expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_mfa_challenges_identity ON md_mfa_challenges(tenant_id,user_id,expires_at);
ALTER TABLE md_sessions ADD COLUMN IF NOT EXISTS mfa_verified boolean NOT NULL DEFAULT false;
ALTER TABLE md_refresh_sessions ADD COLUMN IF NOT EXISTS mfa_verified boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS md_password_reset_requests (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 user_id uuid NOT NULL,
 token_hash text NOT NULL,
 method text NOT NULL CHECK(method IN ('OTP','LINK')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 delivered_at timestamptz,
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_password_reset_throttle (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 email_hash text NOT NULL,
 request_count integer NOT NULL DEFAULT 0,
 window_start timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,email_hash)
);

-- Immutable relational audit of SQL Object and Field metadata changes.
CREATE TABLE IF NOT EXISTS md_object_metadata_history (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 object_api text NOT NULL,
 revision bigint NOT NULL CHECK(revision>0),
 action text NOT NULL,
 actor_user_id uuid,
 snapshot jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,object_api,revision),
 FOREIGN KEY(tenant_id,actor_user_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_object_history_recent ON md_object_metadata_history(tenant_id,object_api,revision DESC);
CREATE OR REPLACE FUNCTION md_capture_object_metadata_history() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
 v_tenant uuid;
 v_api text;
 v_action text;
 v_snapshot jsonb;
 v_revision bigint;
 v_actor uuid;
BEGIN
 IF TG_OP='DELETE' THEN
  v_tenant:=OLD.tenant_id;
  IF TG_TABLE_NAME='md_field_definitions' THEN v_api:=OLD.object_api;
  ELSE v_api:=OLD.api_name; END IF;
 ELSE
  v_tenant:=NEW.tenant_id;
  IF TG_TABLE_NAME='md_field_definitions' THEN v_api:=NEW.object_api;
  ELSE v_api:=NEW.api_name; END IF;
 END IF;
 v_action:=CASE
  WHEN TG_TABLE_NAME='md_field_definitions' THEN 'Field.'||
    CASE TG_OP WHEN 'INSERT' THEN 'Added' WHEN 'UPDATE' THEN 'Updated' ELSE 'Deleted' END
  ELSE 'Object.'||
    CASE TG_OP WHEN 'INSERT' THEN 'Created' WHEN 'UPDATE' THEN 'Updated' ELSE 'Deleted' END
 END;
 v_actor:=NULLIF(current_setting('metadrive.actor_user_id',true),'')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||v_api,0));
 SELECT jsonb_build_object(
   'id',o.id,'apiName',o.api_name,'label',o.label,'pluralLabel',o.label,
   'kind',CASE WHEN o.is_system THEN 'Standard Object' ELSE 'Custom Object' END,
   'description','',
   'fields',COALESCE((
    SELECT jsonb_agg(
     jsonb_build_object('id',f.id,'apiName',f.api_name,'label',COALESCE(f.label,f.api_name),
      'dataType',CASE f.data_type
        WHEN 'text' THEN CASE WHEN f.max_length IS NOT NULL THEN 'Text('||f.max_length::text||')' ELSE 'Text' END
        WHEN 'number' THEN 'Number' WHEN 'boolean' THEN 'Checkbox'
        WHEN 'date' THEN 'Date' WHEN 'datetime' THEN 'Date/Time'
        WHEN 'reference' THEN 'Lookup' ELSE f.data_type END,
      'required',f.required,'unique',false)
      ||CASE WHEN f.related_object IS NOT NULL THEN
       jsonb_build_object('relationship',jsonb_build_object(
        'type','Lookup','targetObject',f.related_object,
        'relationshipName',f.api_name,'childRelationshipName',f.object_api))
       ELSE '{}'::jsonb END
      ORDER BY f.api_name)
    FROM md_field_definitions f
    WHERE f.tenant_id=o.tenant_id AND f.object_api=o.api_name
   ),'[]'::jsonb)
 ) INTO v_snapshot
 FROM md_object_definitions o WHERE o.tenant_id=v_tenant AND o.api_name=v_api;
 SELECT COALESCE(MAX(revision),0)+1 INTO v_revision FROM md_object_metadata_history
 WHERE tenant_id=v_tenant AND object_api=v_api;
 INSERT INTO md_object_metadata_history(tenant_id,object_api,revision,action,actor_user_id,snapshot)
 VALUES(v_tenant,v_api,v_revision,v_action,v_actor,v_snapshot);
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS md_audit_object_metadata ON md_object_definitions;
CREATE TRIGGER md_audit_object_metadata AFTER INSERT OR UPDATE OR DELETE
 ON md_object_definitions FOR EACH ROW EXECUTE FUNCTION md_capture_object_metadata_history();
DROP TRIGGER IF EXISTS md_audit_field_metadata ON md_field_definitions;
CREATE TRIGGER md_audit_field_metadata AFTER INSERT OR UPDATE OR DELETE
 ON md_field_definitions FOR EACH ROW EXECUTE FUNCTION md_capture_object_metadata_history();

CREATE TABLE IF NOT EXISTS md_library_components (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 api_name text NOT NULL,
 label text NOT NULL,
 description text NOT NULL DEFAULT '',
 surfaces text[] NOT NULL DEFAULT '{page}',
 resize jsonb CHECK(resize IS NULL OR jsonb_typeof(resize)='object'),
 jsx_source text NOT NULL DEFAULT '',
 css_source text NOT NULL DEFAULT '',
 compiled_js text NOT NULL DEFAULT '',
 scoped_css text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 published_version integer CHECK(published_version>0),
 status text NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Published')),
 enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,api_name),
 FOREIGN KEY(tenant_id,api_name) REFERENCES md_component_definitions(tenant_id,api_name),
 CHECK(surfaces <@ ARRAY['page','dashboard','flow','platform']::text[])
);
CREATE TABLE IF NOT EXISTS md_library_component_revisions (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 api_name text NOT NULL,
 version integer NOT NULL CHECK(version>0),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 published_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,api_name,version),
 FOREIGN KEY(tenant_id,api_name) REFERENCES md_library_components(tenant_id,api_name)
);
