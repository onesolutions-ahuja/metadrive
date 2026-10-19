ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS rollup_child_object text;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS rollup_relationship_field text;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS rollup_operation text;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS rollup_source_field text;
ALTER TABLE md_field_definitions ADD CONSTRAINT md_field_rollup_operation_check
  CHECK (rollup_operation IS NULL OR rollup_operation IN ('COUNT','SUM','MIN','MAX'));
CREATE INDEX IF NOT EXISTS md_field_rollup_child
  ON md_field_definitions(tenant_id,rollup_child_object)
  WHERE data_type='rollup' AND deleted_at IS NULL;
