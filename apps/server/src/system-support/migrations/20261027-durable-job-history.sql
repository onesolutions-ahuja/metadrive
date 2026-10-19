-- Append-only tenant-scoped state transitions; no payloads or credentials.
CREATE TABLE IF NOT EXISTS md_durable_job_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 status text NOT NULL,
 attempt integer NOT NULL,
 worker_id text,
 error_code text,
 observed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,job_id) REFERENCES md_durable_jobs(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_durable_job_history_tenant_job
 ON md_durable_job_history(tenant_id,job_id,id);
CREATE OR REPLACE FUNCTION md_log_durable_job_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR
    (OLD.status,OLD.attempt,OLD.lease_owner,OLD.error_code)
    IS DISTINCT FROM
    (NEW.status,NEW.attempt,NEW.lease_owner,NEW.error_code) THEN
  INSERT INTO md_durable_job_history(tenant_id,job_id,status,attempt,worker_id,error_code)
  VALUES(NEW.tenant_id,NEW.id,NEW.status,NEW.attempt,NEW.lease_owner,NEW.error_code);
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS md_durable_job_transition_audit ON md_durable_jobs;
CREATE TRIGGER md_durable_job_transition_audit
 AFTER INSERT OR UPDATE ON md_durable_jobs
 FOR EACH ROW EXECUTE FUNCTION md_log_durable_job_transition();

-- Preserve the current state of jobs that predate this additive ledger.
INSERT INTO md_durable_job_history(tenant_id,job_id,status,attempt,worker_id,error_code)
SELECT j.tenant_id,j.id,j.status,j.attempt,j.lease_owner,j.error_code
FROM md_durable_jobs j
WHERE NOT EXISTS(
 SELECT 1 FROM md_durable_job_history h
 WHERE h.tenant_id=j.tenant_id AND h.job_id=j.id
);
