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
