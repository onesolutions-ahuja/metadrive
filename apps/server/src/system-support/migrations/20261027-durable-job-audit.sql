-- Tenant-scoped, immutable operator decision ledger for uncertain durable executions.
-- Stores references and decisions only; no credentials or external payloads.
CREATE TABLE IF NOT EXISTS md_durable_job_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN ('retry','acknowledge','cancel')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,job_id) REFERENCES md_durable_jobs(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_durable_job_audit_lookup
 ON md_durable_job_audit(tenant_id,job_id,created_at,id);
