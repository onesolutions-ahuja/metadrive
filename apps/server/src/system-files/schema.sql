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
CREATE TABLE IF NOT EXISTS md_field_definitions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), object_api text NOT NULL, api_name text NOT NULL, data_type text NOT NULL, related_object text, max_length integer CHECK (max_length BETWEEN 1 AND 1000000), required boolean NOT NULL DEFAULT false, UNIQUE(tenant_id,object_api,api_name), UNIQUE(tenant_id,object_api,id), FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name), FOREIGN KEY(tenant_id,related_object) REFERENCES md_object_definitions(tenant_id,api_name));
CREATE TABLE IF NOT EXISTS md_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), object_api text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,object_api), FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name));
CREATE TABLE IF NOT EXISTS md_record_values (tenant_id uuid NOT NULL REFERENCES md_tenants(id), record_id uuid NOT NULL, object_api text NOT NULL, field_api text NOT NULL, value_text text, reference_record_id uuid, PRIMARY KEY(tenant_id,record_id,field_api), FOREIGN KEY(tenant_id,record_id,object_api) REFERENCES md_records(tenant_id,id,object_api) ON DELETE CASCADE, FOREIGN KEY(tenant_id,object_api,field_api) REFERENCES md_field_definitions(tenant_id,object_api,api_name), FOREIGN KEY(tenant_id,reference_record_id) REFERENCES md_records(tenant_id,id));
CREATE TABLE IF NOT EXISTS md_component_definitions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), api_name text NOT NULL, renderer_key text NOT NULL, enabled boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,api_name), UNIQUE(tenant_id,id));
CREATE TABLE IF NOT EXISTS md_page_definitions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), api_name text NOT NULL, title text NOT NULL, enabled boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,api_name), UNIQUE(tenant_id,id));
CREATE TABLE IF NOT EXISTS md_page_components (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), page_id uuid NOT NULL, component_api text NOT NULL, FOREIGN KEY(tenant_id,page_id) REFERENCES md_page_definitions(tenant_id,id), FOREIGN KEY(tenant_id,component_api) REFERENCES md_component_definitions(tenant_id,api_name), slot text NOT NULL, sort_order integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS md_flow_definitions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), api_name text NOT NULL, version integer NOT NULL, active boolean NOT NULL DEFAULT false, UNIQUE(tenant_id,api_name,version), UNIQUE(tenant_id,id));
CREATE TABLE IF NOT EXISTS md_flow_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES md_tenants(id), flow_id uuid NOT NULL, started_by uuid NOT NULL, FOREIGN KEY(tenant_id,flow_id) REFERENCES md_flow_definitions(tenant_id,id), FOREIGN KEY(tenant_id,started_by) REFERENCES md_users(tenant_id,id), status text NOT NULL, started_at timestamptz NOT NULL DEFAULT now());
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
 api_name text NOT NULL,node_type text NOT NULL,sort_order integer NOT NULL DEFAULT 0, UNIQUE(tenant_id,flow_id,api_name)
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
