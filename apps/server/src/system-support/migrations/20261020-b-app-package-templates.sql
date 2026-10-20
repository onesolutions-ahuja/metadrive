-- Immutable-by-convention published package templates. Publisher workflows must create
-- a new version rather than mutate published versions.
CREATE TABLE IF NOT EXISTS md_app_package_object_templates (
 app_id uuid NOT NULL,version integer NOT NULL,
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 label text NOT NULL CHECK(length(label)>0),
 PRIMARY KEY(app_id,version,api_name),
 FOREIGN KEY(app_id,version) REFERENCES md_app_package_versions(app_id,version) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_app_package_field_templates (
 app_id uuid NOT NULL,version integer NOT NULL,
 object_api text NOT NULL CHECK(object_api ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 label text NOT NULL,data_type text NOT NULL,
 related_object text,max_length integer CHECK(max_length BETWEEN 1 AND 1000000),
 required boolean NOT NULL DEFAULT false,
 PRIMARY KEY(app_id,version,object_api,api_name),
 FOREIGN KEY(app_id,version) REFERENCES md_app_package_versions(app_id,version) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_app_package_component_templates (
 app_id uuid NOT NULL,version integer NOT NULL,
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 renderer_key text NOT NULL,
 PRIMARY KEY(app_id,version,api_name),
 FOREIGN KEY(app_id,version) REFERENCES md_app_package_versions(app_id,version) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_app_package_page_templates (
 app_id uuid NOT NULL,version integer NOT NULL,
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 title text NOT NULL CHECK(length(title)>0),
 PRIMARY KEY(app_id,version,api_name),
 FOREIGN KEY(app_id,version) REFERENCES md_app_package_versions(app_id,version) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_app_package_page_component_templates (
 app_id uuid NOT NULL,version integer NOT NULL,
 page_api text NOT NULL,component_api text NOT NULL,
 slot text NOT NULL,sort_order integer NOT NULL DEFAULT 0,
 PRIMARY KEY(app_id,version,page_api,component_api,slot,sort_order),
 FOREIGN KEY(app_id,version) REFERENCES md_app_package_versions(app_id,version) ON DELETE CASCADE
);
-- Receipts persist after uninstall: existing tenant customisations are never overwritten.
CREATE TABLE IF NOT EXISTS md_app_package_seed_receipts (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 app_id uuid NOT NULL REFERENCES md_apps(id),
 resource_type text NOT NULL CHECK(resource_type IN ('Object','Field','Component','App Page','Page Component')),
 parent_api text NOT NULL DEFAULT '',api_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,app_id,resource_type,parent_api,api_name)
);
