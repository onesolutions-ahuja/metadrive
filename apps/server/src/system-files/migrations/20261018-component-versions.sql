-- Component draft/published versions; preserve history and customer assignments.
ALTER TABLE md_component_definitions ADD COLUMN IF NOT EXISTS published_version integer;
CREATE TABLE IF NOT EXISTS md_component_versions(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 component_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),
 state text NOT NULL CHECK(state IN ('Draft','Published')),
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,component_id,version),
 FOREIGN KEY(tenant_id,component_id) REFERENCES md_component_definitions(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_component_versions_latest ON md_component_versions(tenant_id,component_id,version DESC);
