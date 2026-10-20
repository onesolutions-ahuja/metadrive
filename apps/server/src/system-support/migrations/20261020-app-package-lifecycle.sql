-- Central versioned application manifests; no app code is copied into tenant runtime.
-- Tenants receive only installation receipts and metadata needed by the selected app.
CREATE TABLE IF NOT EXISTS md_app_package_versions (
  app_id uuid NOT NULL REFERENCES md_apps(id),
  version integer NOT NULL CHECK(version > 0),
  published boolean NOT NULL DEFAULT false,
  description text NOT NULL DEFAULT '',
  brand_color text NOT NULL DEFAULT '#2563eb' CHECK(brand_color ~ '^#[0-9a-fA-F]{6}$'),
  PRIMARY KEY(app_id,version)
);
CREATE TABLE IF NOT EXISTS md_app_package_dependencies (
  app_id uuid NOT NULL,
  version integer NOT NULL,
  required_app_id uuid NOT NULL REFERENCES md_apps(id),
  minimum_version integer NOT NULL DEFAULT 1 CHECK(minimum_version > 0),
  PRIMARY KEY(app_id,version,required_app_id),
  FOREIGN KEY(app_id,version) REFERENCES md_app_package_versions(app_id,version) ON DELETE CASCADE,
  CHECK(app_id <> required_app_id)
);
CREATE TABLE IF NOT EXISTS md_app_package_resources (
  app_id uuid NOT NULL,
  version integer NOT NULL,
  resource_type text NOT NULL CHECK(resource_type IN ('Object','Field','Component','App Page','Flow')),
  api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
  parent_api text NOT NULL DEFAULT '' CHECK(parent_api = '' OR parent_api ~ '^[A-Za-z][A-Za-z0-9_]*$'),
  PRIMARY KEY(app_id,version,resource_type,api_name,parent_api),
  FOREIGN KEY(app_id,version) REFERENCES md_app_package_versions(app_id,version) ON DELETE CASCADE,
  CHECK((resource_type='Field' AND parent_api <> '') OR (resource_type<>'Field' AND parent_api=''))
);
CREATE TABLE IF NOT EXISTS md_app_package_navigation (
  app_id uuid NOT NULL,
  version integer NOT NULL,
  entry_type text NOT NULL CHECK(entry_type IN ('Object','App Page')),
  api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY(app_id,version,entry_type,api_name),
  FOREIGN KEY(app_id,version) REFERENCES md_app_package_versions(app_id,version) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_tenant_app_installed_versions (
  tenant_id uuid NOT NULL,
  app_id uuid NOT NULL,
  version integer NOT NULL,
  installed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,app_id),
  FOREIGN KEY(tenant_id,app_id) REFERENCES md_app_installations(tenant_id,app_id) ON DELETE CASCADE,
  FOREIGN KEY(app_id,version) REFERENCES md_app_package_versions(app_id,version)
);
CREATE INDEX IF NOT EXISTS md_app_package_published_lookup
  ON md_app_package_versions(app_id,version DESC) WHERE published=true;
CREATE INDEX IF NOT EXISTS md_app_package_reverse_deps
  ON md_app_package_dependencies(required_app_id,app_id,version);
