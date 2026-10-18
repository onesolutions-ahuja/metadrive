-- Draft Page/Flow definitions with validated SQL JSONB properties and tenant isolation.
CREATE TABLE IF NOT EXISTS md_builder_drafts (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 kind text NOT NULL CHECK(kind IN ('page','flow')),
 api_name text NOT NULL,
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),
 revision integer NOT NULL DEFAULT 1,
 published boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,kind,api_name)
);
