-- Tenant-isolated outbound idempotency reservation and provider receipt metadata.
-- Retain only nonsecret identifiers and response status; never persist response body or credential material.
CREATE TABLE IF NOT EXISTS md_outbound_execution_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 execution_key text NOT NULL CHECK(length(execution_key) BETWEEN 1 AND 256),
 credential_id uuid NOT NULL,
 FOREIGN KEY(tenant_id,credential_id) REFERENCES md_named_credentials(tenant_id,id),
 request_method text NOT NULL CHECK(request_method IN ('POST','PUT','PATCH','DELETE')),
 job_id uuid,
 flow_run_id uuid,
 flow_node_id text,
 attempt_number integer CHECK(attempt_number IS NULL OR attempt_number>0),
 FOREIGN KEY(tenant_id,job_id) REFERENCES md_durable_jobs(tenant_id,id),
 FOREIGN KEY(tenant_id,flow_run_id) REFERENCES md_flow_runs(tenant_id,id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','completed','uncertain')),
 response_status integer,
 provider_receipt text CHECK(provider_receipt IS NULL OR length(provider_receipt)<=256),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,execution_key),
 UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_outbound_execution_receipts_tenant_state
 ON md_outbound_execution_receipts(tenant_id,state,created_at);
