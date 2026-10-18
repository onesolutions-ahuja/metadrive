-- Immutable package-version manifests, tenant installation receipts, and metadata ownership.
CREATE TABLE IF NOT EXISTS md_app_package_versions (
 app_id uuid NOT NULL REFERENCES md_apps(id),
 version integer NOT NULL CHECK(version>0),
 manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(app_id,version)
);
CREATE TABLE IF NOT EXISTS md_app_installed_versions (
 tenant_id uuid NOT NULL,
 app_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),
 upgraded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,app_id),
 FOREIGN KEY(tenant_id,app_id) REFERENCES md_app_installations(tenant_id,app_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_app_owned_definitions (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 app_id uuid NOT NULL REFERENCES md_apps(id),
 kind text NOT NULL CHECK(kind IN ('object','field','page','component','flow')),
 api_name text NOT NULL,
 object_api text NOT NULL DEFAULT '',
 PRIMARY KEY(tenant_id,app_id,kind,api_name,object_api)
);
CREATE INDEX IF NOT EXISTS md_app_owned_definitions_lookup ON md_app_owned_definitions(tenant_id,kind,api_name);
