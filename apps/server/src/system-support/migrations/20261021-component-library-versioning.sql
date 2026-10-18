-- Reuse the tenant-scoped shared Component definition registry for version history.
-- Flexible, schema-validated component display metadata is kept in JSONB; active
-- version, state and revision numbers remain relational and independently queried.
CREATE TABLE IF NOT EXISTS md_component_library_versions(
 tenant_id uuid NOT NULL,
 component_api text NOT NULL,
 version integer NOT NULL CHECK(version>0),
 state text NOT NULL CHECK(state IN ('Draft','Published')),
 properties jsonb NOT NULL CHECK(jsonb_typeof(properties)='object'),
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,component_api,version),
 FOREIGN KEY(tenant_id,component_api) REFERENCES md_component_definitions(tenant_id,api_name),
 FOREIGN KEY(tenant_id,created_by) REFERENCES md_users(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_component_library_heads(
 tenant_id uuid NOT NULL,
 component_api text NOT NULL,
 current_version integer NOT NULL CHECK(current_version>0),
 published_version integer CHECK(published_version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,component_api),
 FOREIGN KEY(tenant_id,component_api) REFERENCES md_component_definitions(tenant_id,api_name),
 FOREIGN KEY(tenant_id,component_api,current_version) REFERENCES md_component_library_versions(tenant_id,component_api,version),
 FOREIGN KEY(tenant_id,component_api,published_version) REFERENCES md_component_library_versions(tenant_id,component_api,version)
);
