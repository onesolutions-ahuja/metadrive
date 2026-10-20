-- Only executions with a caller-provided, UUID requestId enter this ledger.
-- Explicit tenant+actor scope and a unique request key reject duplicated order Flows.
CREATE TABLE IF NOT EXISTS md_flow_execution_requests (
  tenant_id uuid NOT NULL REFERENCES md_tenants(id),
  actor_id uuid NOT NULL,
  flow_api text NOT NULL,
  request_id uuid NOT NULL,
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  run_id uuid,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','completed','failed')),
  result_payload jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,actor_id,flow_api,request_id),
  FOREIGN KEY (tenant_id,actor_id) REFERENCES md_users(tenant_id,id),
  FOREIGN KEY (tenant_id,run_id) REFERENCES md_flow_runs(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_flow_execution_requests_run
  ON md_flow_execution_requests(tenant_id,run_id) WHERE run_id IS NOT NULL;
