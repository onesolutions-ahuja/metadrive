ALTER TABLE md_tenant_settings
 DROP CONSTRAINT IF EXISTS md_tenant_settings_setting_key_check;
ALTER TABLE md_tenant_settings
 ADD CONSTRAINT md_tenant_settings_setting_key_check
 CHECK (setting_key IN ('company-profile','currencies','automation-settings','business-calendar','offline-briefcase'));
