-- Upgrade compatibility: rollup-summaries creates a partial index referencing
-- deleted_at before the later field-recycle-bin migration on existing SQL tenants.
-- This additive precondition is idempotent and never modifies field records.
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
