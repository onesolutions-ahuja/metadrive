ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS md_field_definitions_recycle_bin
  ON md_field_definitions(tenant_id,deleted_at) WHERE deleted_at IS NOT NULL;
