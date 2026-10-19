CREATE TABLE IF NOT EXISTS md_flow_interview_loop_state (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 run_id uuid NOT NULL,
 element_id integer NOT NULL,
 next_index integer NOT NULL CHECK(next_index BETWEEN -1 AND 200),
 PRIMARY KEY(tenant_id,run_id,element_id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES md_flow_interview_state(tenant_id,run_id) ON DELETE CASCADE
);
