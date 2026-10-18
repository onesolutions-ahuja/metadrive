-- Tenant-aware versioned friendly app route metadata.
-- Additive only: existing app installations and business records are preserved.
CREATE TABLE IF NOT EXISTS md_app_route_aliases (
  tenant_id uuid NOT NULL REFERENCES md_tenants(id),
  app_api text NOT NULL REFERENCES md_apps(api_name),
  slug text NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]{0,61}[a-z0-9]$'),
  kind text NOT NULL CHECK (kind IN ('App Home','App Page','Record List')),
  target_api text NOT NULL,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Disabled')),
  version integer NOT NULL DEFAULT 1 CHECK (version>=1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,app_api,slug)
);
