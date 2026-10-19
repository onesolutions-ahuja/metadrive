CREATE TABLE IF NOT EXISTS md_flow_email_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 run_id uuid NOT NULL,
 flow_id uuid NOT NULL,
 flow_version integer NOT NULL CHECK(flow_version>0),
 node_id integer NOT NULL,
 step integer NOT NULL CHECK(step BETWEEN 0 AND 199),
 user_id uuid NOT NULL,
 credential_id uuid NOT NULL,
 payload_ciphertext bytea NOT NULL,
 encryption_key_id text NOT NULL,
 status text NOT NULL DEFAULT 'queued'
  CHECK(status IN ('queued','sending','completed','failed')),
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz,
 completed_at timestamptz,
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,run_id,node_id,step),
 FOREIGN KEY(tenant_id,run_id) REFERENCES md_flow_runs(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,flow_id) REFERENCES md_flow_definitions(tenant_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,credential_id) REFERENCES md_named_credentials(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_flow_email_jobs_queue
 ON md_flow_email_jobs(status,created_at,id) WHERE status='queued';
