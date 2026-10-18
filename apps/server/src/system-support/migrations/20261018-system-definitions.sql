-- Run by the versioned SQL migration runner before enabling the new routes.
-- Shared metadata for optional runtime definitions. Never stores credentials or secrets.
CREATE TABLE IF NOT EXISTS md_system_definitions (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 kind text NOT NULL CHECK (kind IN ('platform-events','email-alerts','approval-processes','dashboards','dashboard-folders','dashboard-territories','report-folders','reports','connector-providers','integration-connections')),
 api_name text NOT NULL,
 label text NOT NULL,
 properties jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(properties)='object'),
 enabled boolean NOT NULL DEFAULT true,
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,kind,api_name)
);
CREATE INDEX IF NOT EXISTS md_system_definitions_lookup ON md_system_definitions(tenant_id,kind,enabled);
