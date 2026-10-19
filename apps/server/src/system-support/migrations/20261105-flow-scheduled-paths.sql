ALTER TABLE md_flow_runs ADD COLUMN IF NOT EXISTS wait_kind text NOT NULL DEFAULT 'wait';
ALTER TABLE md_flow_runs DROP CONSTRAINT IF EXISTS md_flow_runs_wait_kind_check;
ALTER TABLE md_flow_runs ADD CONSTRAINT md_flow_runs_wait_kind_check
 CHECK(wait_kind IN ('wait','scheduled-path'));
