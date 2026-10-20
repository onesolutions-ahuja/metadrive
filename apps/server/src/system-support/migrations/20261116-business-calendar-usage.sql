ALTER TABLE md_tenant_settings
 DROP CONSTRAINT IF EXISTS md_tenant_settings_setting_key_check;
ALTER TABLE md_tenant_settings
 ADD CONSTRAINT md_tenant_settings_setting_key_check
 CHECK (setting_key IN ('company-profile','currencies','automation-settings','business-calendar'));

ALTER TABLE md_tenant_usage_targets
 DROP CONSTRAINT IF EXISTS md_tenant_usage_targets_metric_check;
ALTER TABLE md_tenant_usage_targets
 ADD CONSTRAINT md_tenant_usage_targets_metric_check
 CHECK (metric IN ('users','records','objects','flows','storage_bytes','api_requests_daily'));

CREATE TABLE IF NOT EXISTS md_tenant_api_usage_daily (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id) ON DELETE CASCADE,
 usage_date date NOT NULL,
 request_count bigint NOT NULL DEFAULT 0 CHECK(request_count>=0),
 PRIMARY KEY(tenant_id,usage_date)
);
