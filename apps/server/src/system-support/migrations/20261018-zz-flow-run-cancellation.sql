-- Additive upgrade: explicit cancellation state for durable SQL Flow interviews.
-- Preserves all existing runs, statuses and timestamps.
ALTER TABLE md_flow_runs DROP CONSTRAINT IF EXISTS md_flow_runs_status_check;
ALTER TABLE md_flow_runs ADD CONSTRAINT md_flow_runs_status_check
  CHECK (status IN ('pending','completed','failed','cancelled'));
