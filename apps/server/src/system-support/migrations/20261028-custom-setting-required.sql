ALTER TABLE md_custom_setting_fields
  ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT false;
