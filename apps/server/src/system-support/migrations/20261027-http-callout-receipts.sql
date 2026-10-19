-- Typed provider HTTP acknowledgement only: never persist remote response bodies or secrets.
CREATE TABLE IF NOT EXISTS md_http_callout_receipts (
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 attempt integer NOT NULL CHECK(attempt>0),
 response_status integer NOT NULL CHECK(response_status BETWEEN 100 AND 599),
 received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,job_id,attempt),
 FOREIGN KEY(tenant_id,job_id) REFERENCES md_http_callout_jobs(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_http_callout_receipts_job
 ON md_http_callout_receipts(tenant_id,job_id,received_at DESC);
