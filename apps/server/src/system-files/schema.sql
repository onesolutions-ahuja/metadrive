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

-- Tenant-scoped relational Page Layout metadata. No prior layouts or records are changed.
CREATE TABLE IF NOT EXISTS md_object_layout_versions (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,object_api),
  FOREIGN KEY (tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_object_page_layouts (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  layout_id text NOT NULL CHECK (length(layout_id) BETWEEN 1 AND 128),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  sort_order integer NOT NULL,
  PRIMARY KEY (tenant_id,object_api,layout_id),
  FOREIGN KEY (tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_object_page_layout_sections (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  layout_id text NOT NULL,
  section_id text NOT NULL CHECK (length(section_id) BETWEEN 1 AND 128),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  columns smallint NOT NULL CHECK (columns IN (1,2)),
  sort_order integer NOT NULL,
  PRIMARY KEY (tenant_id,object_api,layout_id,section_id),
  FOREIGN KEY (tenant_id,object_api,layout_id) REFERENCES md_object_page_layouts(tenant_id,object_api,layout_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_object_page_layout_fields (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  layout_id text NOT NULL,
  section_id text NOT NULL,
  field_api text NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (tenant_id,object_api,layout_id,section_id,field_api),
  FOREIGN KEY (tenant_id,object_api,layout_id,section_id) REFERENCES md_object_page_layout_sections(tenant_id,object_api,layout_id,section_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,object_api,field_api) REFERENCES md_field_definitions(tenant_id,object_api,api_name)
);
CREATE TABLE IF NOT EXISTS md_object_page_layout_actions (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  layout_id text NOT NULL,
  action_name text NOT NULL CHECK (length(action_name) BETWEEN 1 AND 128),
  sort_order integer NOT NULL,
  PRIMARY KEY (tenant_id,object_api,layout_id,action_name),
  FOREIGN KEY (tenant_id,object_api,layout_id) REFERENCES md_object_page_layouts(tenant_id,object_api,layout_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_object_page_layout_related_lists (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  layout_id text NOT NULL,
  list_name text NOT NULL CHECK (length(list_name) BETWEEN 1 AND 128),
  sort_order integer NOT NULL,
  PRIMARY KEY (tenant_id,object_api,layout_id,list_name),
  FOREIGN KEY (tenant_id,object_api,layout_id) REFERENCES md_object_page_layouts(tenant_id,object_api,layout_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_object_page_layout_links (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  layout_id text NOT NULL,
  link_id text NOT NULL CHECK (length(link_id) BETWEEN 1 AND 128),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  url text NOT NULL CHECK (length(url) BETWEEN 1 AND 2048),
  open_in_new_window boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL,
  PRIMARY KEY (tenant_id,object_api,layout_id,link_id),
  FOREIGN KEY (tenant_id,object_api,layout_id) REFERENCES md_object_page_layouts(tenant_id,object_api,layout_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_object_page_layout_assignments (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  profile_id text NOT NULL CHECK (length(profile_id) BETWEEN 1 AND 128),
  record_type_id text NOT NULL CHECK (length(record_type_id) BETWEEN 1 AND 128),
  layout_id text NOT NULL,
  PRIMARY KEY (tenant_id,object_api,profile_id,record_type_id),
  FOREIGN KEY (tenant_id,object_api,layout_id) REFERENCES md_object_page_layouts(tenant_id,object_api,layout_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_object_page_layout_fields_lookup ON md_object_page_layout_fields(tenant_id,object_api,layout_id);


-- Idempotent backfill: add a default only where the object has no Page Layout.
-- Never overwrite or replace tenant-owned configurations.
INSERT INTO md_object_page_layouts(tenant_id,object_api,layout_id,label,sort_order)
SELECT o.tenant_id,o.api_name,'default',o.label||' Layout',0
FROM md_object_definitions o WHERE NOT EXISTS (
 SELECT 1 FROM md_object_page_layouts l
 WHERE l.tenant_id=o.tenant_id AND l.object_api=o.api_name
) ON CONFLICT DO NOTHING;
INSERT INTO md_object_page_layout_sections(tenant_id,object_api,layout_id,section_id,label,columns,sort_order)
SELECT l.tenant_id,l.object_api,l.layout_id,'details','Record Information',2,0
FROM md_object_page_layouts l
WHERE l.layout_id='default' AND NOT EXISTS (
 SELECT 1 FROM md_object_page_layout_sections s
 WHERE s.tenant_id=l.tenant_id AND s.object_api=l.object_api AND s.layout_id=l.layout_id
) ON CONFLICT DO NOTHING;
INSERT INTO md_object_page_layout_fields(tenant_id,object_api,layout_id,section_id,field_api,sort_order)
SELECT s.tenant_id,s.object_api,s.layout_id,s.section_id,f.api_name,
 row_number() OVER (PARTITION BY s.tenant_id,s.object_api,s.layout_id,s.section_id ORDER BY f.api_name)-1
FROM md_object_page_layout_sections s JOIN md_field_definitions f
 ON f.tenant_id=s.tenant_id AND f.object_api=s.object_api
WHERE s.layout_id='default' AND s.section_id='details'
AND NOT EXISTS (
 SELECT 1 FROM md_object_page_layout_fields pf
 WHERE pf.tenant_id=s.tenant_id AND pf.object_api=s.object_api AND pf.layout_id=s.layout_id
) ON CONFLICT DO NOTHING;
INSERT INTO md_object_page_layout_actions(tenant_id,object_api,layout_id,action_name,sort_order)
SELECT l.tenant_id,l.object_api,l.layout_id,a.action_name,a.sort_order
FROM md_object_page_layouts l
CROSS JOIN (VALUES ('New',0),('Edit',1),('Delete',2)) AS a(action_name,sort_order)
WHERE l.layout_id='default' AND NOT EXISTS (
 SELECT 1 FROM md_object_page_layout_actions x
 WHERE x.tenant_id=l.tenant_id AND x.object_api=l.object_api AND x.layout_id=l.layout_id
) ON CONFLICT DO NOTHING;

-- Normalized, tenant-scoped Lightning Page definition, component tree and activation.
-- Existing app seed pages are retained; no JSON/JSONB storage.
CREATE TABLE IF NOT EXISTS md_lightning_page_details (
 tenant_id uuid NOT NULL, page_id uuid NOT NULL,
 page_type text NOT NULL CHECK(page_type IN ('Record Page','App Page','Home Page')),
 target_object text NOT NULL DEFAULT '',
 layout_mode text NOT NULL CHECK(layout_mode IN ('template','free-canvas')),
 template text,
 canvas_width integer NOT NULL CHECK(canvas_width BETWEEN 320 AND 10000),
 canvas_height integer NOT NULL CHECK(canvas_height BETWEEN 320 AND 10000),
 status text NOT NULL CHECK(status IN ('Draft','Active')),
 devices text[] NOT NULL CHECK(cardinality(devices) BETWEEN 1 AND 2),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,page_id),
 FOREIGN KEY(tenant_id,page_id) REFERENCES md_page_definitions(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_lightning_page_nodes (
 tenant_id uuid NOT NULL, page_id uuid NOT NULL,
 component_key text NOT NULL CHECK(length(component_key) BETWEEN 1 AND 128),
 component_type text NOT NULL CHECK(length(component_type) BETWEEN 1 AND 128),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 200),
 region text NOT NULL DEFAULT 'main',
 visible boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL,
 PRIMARY KEY(tenant_id,page_id,component_key),
 FOREIGN KEY(tenant_id,page_id) REFERENCES md_lightning_page_details(tenant_id,page_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_lightning_page_node_properties (
 tenant_id uuid NOT NULL, page_id uuid NOT NULL,
 component_key text NOT NULL,
 property_path text NOT NULL CHECK(length(property_path) BETWEEN 1 AND 1024),
 value_kind text NOT NULL CHECK(value_kind IN ('string','number','boolean','null','array','object')),
 value_text text,
 PRIMARY KEY(tenant_id,page_id,component_key,property_path),
 FOREIGN KEY(tenant_id,page_id,component_key)
   REFERENCES md_lightning_page_nodes(tenant_id,page_id,component_key) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_lightning_page_activation (
 tenant_id uuid NOT NULL, page_id uuid NOT NULL,
 assignment_id text NOT NULL CHECK(length(assignment_id) BETWEEN 1 AND 128),
 scope text NOT NULL CHECK(scope IN ('Org Default','App Default','App and Profile','App, Record Type, and Profile')),
 app_api text, profile_id text, record_type_id text,
 desktop boolean NOT NULL DEFAULT true,
 phone boolean NOT NULL DEFAULT false,
 sort_order integer NOT NULL,
 PRIMARY KEY(tenant_id,page_id,assignment_id),
 FOREIGN KEY(tenant_id,page_id) REFERENCES md_lightning_page_details(tenant_id,page_id) ON DELETE CASCADE,
 CHECK(desktop OR phone)
);
CREATE INDEX IF NOT EXISTS md_lightning_page_active_lookup
 ON md_lightning_page_details(tenant_id,target_object,page_type,status);


-- Explicit tenant profiles and grants. Permission evaluation continues to use the shared SQL RBAC engine.
CREATE TABLE IF NOT EXISTS md_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 api_name text NOT NULL,
 label text NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,api_name)
);
CREATE TABLE IF NOT EXISTS md_user_profiles (
 tenant_id uuid NOT NULL,
 user_id uuid NOT NULL,
 profile_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,profile_id) REFERENCES md_profiles(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_profile_permission_sets (
 tenant_id uuid NOT NULL,
 profile_id uuid NOT NULL,
 permission_set_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,profile_id,permission_set_id),
 FOREIGN KEY(tenant_id,profile_id) REFERENCES md_profiles(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,permission_set_id) REFERENCES md_permission_sets(tenant_id,id) ON DELETE CASCADE
);
INSERT INTO md_profiles(tenant_id,api_name,label)
 SELECT id,'Default','Default Profile' FROM md_tenants
 ON CONFLICT(tenant_id,api_name) DO NOTHING;
INSERT INTO md_user_profiles(tenant_id,user_id,profile_id)
 SELECT u.tenant_id,u.id,p.id FROM md_users u
 JOIN md_profiles p ON p.tenant_id=u.tenant_id AND p.api_name='Default'
 ON CONFLICT(tenant_id,user_id) DO NOTHING;


-- Record types and allowed picklist values are object-scoped relational rows.
CREATE TABLE IF NOT EXISTS md_object_record_types (
 tenant_id uuid NOT NULL,
 object_api text NOT NULL,
 record_type_id text NOT NULL CHECK(length(record_type_id) BETWEEN 1 AND 128),
 developer_name text NOT NULL,
 label text NOT NULL,
 description text NOT NULL DEFAULT '',
 active boolean NOT NULL DEFAULT true,
 is_default boolean NOT NULL DEFAULT false,
 sort_order integer NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,object_api,record_type_id),
 FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_object_record_type_values (
 tenant_id uuid NOT NULL,object_api text NOT NULL,record_type_id text NOT NULL,
 field_api text NOT NULL,field_value text NOT NULL,sort_order integer NOT NULL,
 PRIMARY KEY(tenant_id,object_api,record_type_id,field_api,field_value),
 FOREIGN KEY(tenant_id,object_api,record_type_id)
  REFERENCES md_object_record_types(tenant_id,object_api,record_type_id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,object_api,field_api)
  REFERENCES md_field_definitions(tenant_id,object_api,api_name)
);
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS record_type_id text;
INSERT INTO md_object_record_types(tenant_id,object_api,record_type_id,developer_name,label,active,is_default,sort_order)
 SELECT o.tenant_id,o.api_name,'master','Master','Master',true,true,0
 FROM md_object_definitions o WHERE NOT EXISTS(
  SELECT 1 FROM md_object_record_types r WHERE r.tenant_id=o.tenant_id AND r.object_api=o.api_name
 ) ON CONFLICT DO NOTHING;

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

-- Extended scalar field metadata stays fully relational and tenant-scoped.
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS picklist_restricted boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS md_field_picklist_values (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  field_api text NOT NULL,
  value text NOT NULL CHECK(length(value) BETWEEN 1 AND 512),
  sort_order integer NOT NULL,
  PRIMARY KEY(tenant_id,object_api,field_api,value),
  FOREIGN KEY(tenant_id,object_api,field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_field_picklist_values_order
  ON md_field_picklist_values(tenant_id,object_api,field_api,sort_order);

-- Additive, tenant-scoped Builder metadata. No business records or existing app installations are removed.
-- General metadata values use relational path/value rows shared with the Component and Page engines.
CREATE TABLE IF NOT EXISTS md_flow_editor_values (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 flow_id uuid NOT NULL,
 property_path text NOT NULL CHECK(length(property_path) BETWEEN 1 AND 1024),
 value_kind text NOT NULL CHECK(value_kind IN ('string','number','boolean','null','array','object')),
 value_text text,
 PRIMARY KEY(tenant_id,flow_id,property_path),
 FOREIGN KEY(tenant_id,flow_id) REFERENCES md_flow_definitions(tenant_id,id) ON DELETE CASCADE
);
ALTER TABLE md_flow_definitions ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS md_flow_definitions_latest
 ON md_flow_definitions(tenant_id,api_name,version DESC) WHERE archived=false;

-- Tenant-owned custom application definitions have independent public API names.
-- md_apps remains the global licensed catalog with an internal unique identity.
ALTER TABLE md_apps ADD COLUMN IF NOT EXISTS tenant_owner_id uuid REFERENCES md_tenants(id);
CREATE TABLE IF NOT EXISTS md_tenant_app_metadata (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 app_id uuid NOT NULL REFERENCES md_apps(id),
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 200),
 description text NOT NULL DEFAULT '',
 brand_color text NOT NULL DEFAULT '#2563eb',
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 PRIMARY KEY(tenant_id,app_id),
 UNIQUE(tenant_id,api_name),
 FOREIGN KEY(app_id) REFERENCES md_apps(id)
);
CREATE TABLE IF NOT EXISTS md_tenant_app_navigation (
 tenant_id uuid NOT NULL,
 app_id uuid NOT NULL,
 entry_type text NOT NULL CHECK(entry_type IN ('Object','App Page')),
 api_name text NOT NULL,
 sort_order integer NOT NULL,
 PRIMARY KEY(tenant_id,app_id,entry_type,api_name),
 FOREIGN KEY(tenant_id,app_id) REFERENCES md_tenant_app_metadata(tenant_id,app_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_tenant_app_utilities (
 tenant_id uuid NOT NULL, app_id uuid NOT NULL,
 utility_name text NOT NULL CHECK(utility_name IN ('Notes','History')),
 sort_order integer NOT NULL,
 PRIMARY KEY(tenant_id,app_id,utility_name),
 FOREIGN KEY(tenant_id,app_id) REFERENCES md_tenant_app_metadata(tenant_id,app_id) ON DELETE CASCADE
);

-- Durable tenant-isolated Screen Flow cursor and typed values. No JSON/JSONB.
CREATE TABLE IF NOT EXISTS md_flow_interview_state (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 run_id uuid NOT NULL,
 current_element integer NOT NULL,
 history_elements integer[] NOT NULL DEFAULT '{}',
 step_count integer NOT NULL DEFAULT 0 CHECK (step_count BETWEEN 0 AND 200),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,run_id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES md_flow_runs(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_flow_interview_values (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 run_id uuid NOT NULL,
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 value_text text,
 data_type text NOT NULL CHECK(data_type IN ('string','number','boolean','null')),
 PRIMARY KEY(tenant_id,run_id,api_name),
 FOREIGN KEY(tenant_id,run_id) REFERENCES md_flow_interview_state(tenant_id,run_id) ON DELETE CASCADE
);

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
