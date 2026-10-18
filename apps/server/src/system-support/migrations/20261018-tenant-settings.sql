-- Additive, tenant-isolated settings storage. Preserve existing tenants and metadata.
CREATE TABLE IF NOT EXISTS md_tenant_settings (
  tenant_id uuid NOT NULL REFERENCES md_tenants(id),
  setting_key text NOT NULL CHECK (setting_key IN ('company-profile','currencies','automation-settings')),
  properties jsonb NOT NULL CHECK (jsonb_typeof(properties)='object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,setting_key)
);
