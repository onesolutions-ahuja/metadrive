-- Stable per-occurrence external execution identity.
-- Manual reconciliation/retry preserves the scope; a completed recurring occurrence rotates it.
ALTER TABLE md_durable_jobs
 ADD COLUMN IF NOT EXISTS execution_scope uuid NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS md_durable_jobs_execution_scope
 ON md_durable_jobs(tenant_id,execution_scope);
