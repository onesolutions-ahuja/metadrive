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
