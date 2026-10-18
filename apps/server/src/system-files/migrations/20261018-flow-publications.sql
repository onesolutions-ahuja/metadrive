-- Immutable Flow visual metadata per runtime version, separate from mutable draft.
CREATE TABLE IF NOT EXISTS md_flow_publications (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 flow_id uuid NOT NULL,
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),
 published_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,flow_id),
 FOREIGN KEY(tenant_id,flow_id) REFERENCES md_flow_definitions(tenant_id,id)
);
ALTER TABLE md_screen_interviews ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb
 CHECK(jsonb_typeof(history)='array');
