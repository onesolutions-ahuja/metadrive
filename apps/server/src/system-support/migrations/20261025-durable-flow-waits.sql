-- Persist Flow Wait state and allow interviews to be distinguished from screens.
ALTER TABLE md_flow_runs DROP CONSTRAINT IF EXISTS md_flow_runs_status_check;
ALTER TABLE md_flow_runs ADD CONSTRAINT md_flow_runs_status_check
 CHECK(status IN ('pending','waiting','completed','failed','cancelled'));
ALTER TABLE md_flow_runs ADD COLUMN IF NOT EXISTS wait_until timestamptz;
CREATE INDEX IF NOT EXISTS md_flow_runs_waiting
 ON md_flow_runs(tenant_id,wait_until) WHERE status='waiting';
