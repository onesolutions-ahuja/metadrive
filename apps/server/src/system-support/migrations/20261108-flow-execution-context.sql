ALTER TABLE md_flow_definitions ADD COLUMN IF NOT EXISTS system_context_approved_by uuid;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
   WHERE conname='md_flow_definitions_system_context_approved_by_fkey') THEN
  ALTER TABLE md_flow_definitions
   ADD CONSTRAINT md_flow_definitions_system_context_approved_by_fkey
   FOREIGN KEY(tenant_id,system_context_approved_by) REFERENCES md_users(tenant_id,id);
 END IF;
END $$;

ALTER TABLE md_flow_runs ADD COLUMN IF NOT EXISTS initiated_by uuid;
UPDATE md_flow_runs SET initiated_by=started_by WHERE initiated_by IS NULL;
ALTER TABLE md_flow_runs ALTER COLUMN initiated_by SET NOT NULL;
ALTER TABLE md_flow_runs ADD COLUMN IF NOT EXISTS execution_context text NOT NULL DEFAULT 'User';
ALTER TABLE md_flow_runs DROP CONSTRAINT IF EXISTS md_flow_runs_execution_context_check;
ALTER TABLE md_flow_runs ADD CONSTRAINT md_flow_runs_execution_context_check
 CHECK(execution_context IN ('User','System'));
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='md_flow_runs_initiated_by_fkey') THEN
  ALTER TABLE md_flow_runs ADD CONSTRAINT md_flow_runs_initiated_by_fkey
   FOREIGN KEY(tenant_id,initiated_by) REFERENCES md_users(tenant_id,id);
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS md_flow_execution_audit (
 tenant_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 flow_id uuid NOT NULL,
 run_id uuid,
 actor_user_id uuid NOT NULL,
 initiating_user_id uuid NOT NULL,
 event text NOT NULL CHECK(event IN ('system-context-approved','system-context-run')),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,flow_id) REFERENCES md_flow_definitions(tenant_id,id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES md_flow_runs(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_user_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,initiating_user_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_flow_execution_audit_lookup
 ON md_flow_execution_audit(tenant_id,flow_id,occurred_at DESC);
