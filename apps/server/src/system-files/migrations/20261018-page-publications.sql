-- Keep published Page versions and stable editor/component identities in SQL.
ALTER TABLE md_page_components ADD COLUMN IF NOT EXISTS editor_key text;
CREATE UNIQUE INDEX IF NOT EXISTS md_page_component_editor_key
 ON md_page_components(tenant_id,page_id,editor_key) WHERE editor_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS md_page_publications (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 page_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),
 published_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,page_id,version),
 FOREIGN KEY(tenant_id,page_id) REFERENCES md_page_definitions(tenant_id,id)
);
