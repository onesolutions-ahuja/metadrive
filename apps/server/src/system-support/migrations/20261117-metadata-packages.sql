CREATE TABLE IF NOT EXISTS md_metadata_package_installations(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id) ON DELETE CASCADE,
 package_api text NOT NULL,
 label text NOT NULL,
 package_type text NOT NULL CHECK(package_type IN ('Managed','Unlocked')),
 version integer NOT NULL CHECK(version>0),
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 active boolean NOT NULL DEFAULT true,
 installed_by uuid NOT NULL REFERENCES md_users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,package_api)
);
CREATE TABLE IF NOT EXISTS md_metadata_package_versions(
 tenant_id uuid NOT NULL,
 package_api text NOT NULL,
 version integer NOT NULL CHECK(version>0),
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 installed_by uuid NOT NULL,
 installed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,package_api,version),
 FOREIGN KEY(tenant_id,package_api)
  REFERENCES md_metadata_package_installations(tenant_id,package_api) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,installed_by) REFERENCES md_users(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_metadata_package_components(
 tenant_id uuid NOT NULL,
 package_api text NOT NULL,
 component_type text NOT NULL CHECK(component_type IN ('object','page','component')),
 component_api text NOT NULL,
 component_state text NOT NULL DEFAULT 'Active'
  CHECK(component_state IN ('Active','Disabled','Retained')),
 component_digest text NOT NULL CHECK(component_digest ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(tenant_id,package_api,component_type,component_api),
 FOREIGN KEY(tenant_id,package_api)
  REFERENCES md_metadata_package_installations(tenant_id,package_api) ON DELETE CASCADE
);
