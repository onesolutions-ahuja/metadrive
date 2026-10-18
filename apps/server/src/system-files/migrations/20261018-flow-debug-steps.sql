-- Durable, value-free execution traces for tenant-safe Flow debugging.
CREATE TABLE IF NOT EXISTS md_flow_run_steps (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 run_id uuid NOT NULL,
 step_number integer NOT NULL CHECK(step_number BETWEEN 0 AND 200),
 node_api text NOT NULL,
 node_type text NOT NULL,
 outcome text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,run_id,step_number),
 FOREIGN KEY(tenant_id,run_id) REFERENCES md_flow_runs(tenant_id,id) ON DELETE CASCADE
);
