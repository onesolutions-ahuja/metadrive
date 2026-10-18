-- Durable tenant-isolated Screen Flow cursor and typed values. No JSON/JSONB.
CREATE TABLE IF NOT EXISTS md_flow_interview_state (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 run_id uuid NOT NULL,
 current_element integer NOT NULL,
 history_elements integer[] NOT NULL DEFAULT '{}',
 step_count integer NOT NULL DEFAULT 0 CHECK (step_count BETWEEN 0 AND 200),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,run_id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES md_flow_runs(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_flow_interview_values (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 run_id uuid NOT NULL,
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 value_text text,
 data_type text NOT NULL CHECK(data_type IN ('string','number','boolean','null')),
 PRIMARY KEY(tenant_id,run_id,api_name),
 FOREIGN KEY(tenant_id,run_id) REFERENCES md_flow_interview_state(tenant_id,run_id) ON DELETE CASCADE
);
