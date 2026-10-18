-- Shared, application-neutral and tenant-isolated durable job substrate.
-- Dispatch and execution must additionally enforce central RBAC, app licensing,
-- active published metadata and execution-context policy.
CREATE TABLE IF NOT EXISTS md_durable_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 app_api_name text,
 job_type text NOT NULL CHECK (length(job_type) BETWEEN 1 AND 128),
 resource_id text,
 resource_version integer CHECK(resource_version>0),
 actor_user_id uuid,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','leased','completed','failed','cancelled')),
 scheduled_at timestamptz NOT NULL DEFAULT now(),
 recurrence_seconds integer CHECK(recurrence_seconds BETWEEN 60 AND 31536000),
 attempt integer NOT NULL DEFAULT 0 CHECK(attempt>=0),
 max_attempts integer NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 100),
 lease_owner text,
 lease_until timestamptz,
 idempotency_key text,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY (tenant_id,actor_user_id) REFERENCES md_users(tenant_id,id),
 CONSTRAINT md_durable_jobs_lease CHECK(status <> 'leased' OR (lease_owner IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS md_durable_jobs_idempotent
 ON md_durable_jobs(tenant_id,job_type,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS md_durable_jobs_ready
 ON md_durable_jobs(scheduled_at,id) WHERE status='queued';
CREATE INDEX IF NOT EXISTS md_durable_jobs_tenant_status
 ON md_durable_jobs(tenant_id,status,scheduled_at);
CREATE INDEX IF NOT EXISTS md_durable_jobs_expired
 ON md_durable_jobs(lease_until) WHERE status='leased';
-- Payloads are deliberately NOT JSONB. Store versioned execution inputs through
-- typed child rows before enabling dispatch.
CREATE TABLE IF NOT EXISTS md_durable_job_values(
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 name text NOT NULL,
 value_text text,
 value_number numeric,
 value_boolean boolean,
 value_datetime timestamptz,
 reference_id uuid,
 PRIMARY KEY(tenant_id,job_id,name),
 FOREIGN KEY(tenant_id,job_id) REFERENCES md_durable_jobs(tenant_id,id) ON DELETE CASCADE,
 CHECK(num_nonnulls(value_text,value_number,value_boolean,value_datetime,reference_id)<=1)
);
