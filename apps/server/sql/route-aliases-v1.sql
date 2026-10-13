-- MD-09 Phase 6B. Additive, metadata-only, independently reversible migration.
-- Apply ONLY after a verified backup + isolated restore; do not touch existing URLs.
-- This table must be installed before enabling alias CRUD. It is deliberately not
-- attached to the legacy JSONB platform blob and works across persistence modes.
BEGIN;
CREATE TABLE IF NOT EXISTS md_route_aliases (
  tenant_id TEXT NOT NULL,
  app_api_name TEXT NOT NULL CHECK (app_api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]{0,61}[a-z0-9]$'),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('App Home','App Page','Record List')),
  target_api_name TEXT NOT NULL CHECK (target_api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
  status TEXT NOT NULL CHECK (status IN ('Active','Disabled')),
  version INTEGER NOT NULL CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,app_api_name,slug)
);
CREATE TABLE IF NOT EXISTS md_route_alias_revisions (
  tenant_id TEXT NOT NULL,
  app_api_name TEXT NOT NULL,
  slug TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('App Home','App Page','Record List')),
  target_api_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Active','Disabled')),
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,app_api_name,slug,version),
  FOREIGN KEY (tenant_id,app_api_name,slug)
    REFERENCES md_route_aliases(tenant_id,app_api_name,slug) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS md_route_aliases_tenant_lookup ON md_route_aliases(tenant_id,app_api_name,status);
COMMIT;
