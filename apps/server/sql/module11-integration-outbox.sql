-- Module 11: typed SQL-only integration delivery queue. Apply in isolated staging first.
-- The request envelope MUST be AES-encrypted by the application before insertion.
CREATE TABLE IF NOT EXISTS md_integration_outbox (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL CHECK (length(tenant_id)>0),
  credential_id text NOT NULL CHECK (length(credential_id)>0),
  operation_key text NOT NULL CHECK (length(operation_key) BETWEEN 1 AND 200),
  method text NOT NULL,
  request_path text NOT NULL,
  encrypted_request text NOT NULL CHECK (encrypted_request LIKE 'enc:%' OR encrypted_request='' AND status IN ('succeeded','dead')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','succeeded','dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  lease_owner text,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  response_status integer,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,credential_id,operation_key),
  CHECK ((status='leased')=(lease_owner IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS md_integration_outbox_ready_idx ON md_integration_outbox
  (tenant_id,next_attempt_at,created_at) WHERE status IN ('pending','leased');
