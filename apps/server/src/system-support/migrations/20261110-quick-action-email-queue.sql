-- Queued Quick Action email reuses the existing encrypted SMTP credential service.
-- A client-generated request key deduplicates retries without retrying unknown SMTP outcomes.
CREATE TABLE IF NOT EXISTS md_quick_action_email_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 user_id uuid NOT NULL,
 object_api text NOT NULL,
 record_id uuid,
 action_id text NOT NULL,
 credential_id uuid NOT NULL,
 payload_ciphertext bytea NOT NULL,
 encryption_key_id text NOT NULL,
 request_key uuid NOT NULL,
 payload_digest text NOT NULL CHECK(payload_digest ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'queued'
  CHECK(status IN ('queued','sending','completed','failed')),
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz,
 completed_at timestamptz,
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,user_id,request_key),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,credential_id) REFERENCES md_named_credentials(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_quick_action_email_jobs_queue
 ON md_quick_action_email_jobs(status,created_at,id) WHERE status='queued';
