CREATE TABLE IF NOT EXISTS md_http_callout_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 run_id uuid NOT NULL,
 node_id integer NOT NULL,
 user_id uuid NOT NULL,
 credential_id uuid NOT NULL,
 method text NOT NULL CHECK(method IN ('GET','POST','PUT','PATCH','DELETE')),
 path_ciphertext bytea NOT NULL,
 headers_ciphertext bytea NOT NULL,
 body_ciphertext bytea,
 idempotency_key_ciphertext bytea,
 max_attempts integer NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 5),
 timeout_ms integer NOT NULL CHECK(timeout_ms BETWEEN 1000 AND 30000),
 status text NOT NULL DEFAULT 'queued'
  CHECK(status IN ('queued','processing','retrying','completed','failed')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES md_flow_runs(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_http_callout_jobs_ready
 ON md_http_callout_jobs(status,next_attempt_at,created_at);
CREATE TABLE IF NOT EXISTS md_http_callout_job_values (
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_.]*$'),
 value_ciphertext bytea NOT NULL,
 data_type text NOT NULL CHECK(data_type IN ('string','number','boolean','null')),
 PRIMARY KEY(tenant_id,job_id,api_name),
 FOREIGN KEY(tenant_id,job_id)
  REFERENCES md_http_callout_jobs(tenant_id,id) ON DELETE CASCADE
);
