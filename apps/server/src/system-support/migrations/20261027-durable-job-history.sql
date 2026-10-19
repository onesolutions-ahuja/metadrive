-- Immutable tenant-scoped lifecycle history, written in the same transaction as each job state change.
-- Records only execution metadata: never serialize Flow payloads, credentials, or provider bodies.
CREATE TABLE IF NOT EXISTS md_durable_job_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('enqueued','claimed','completed','failed','cancelled','rescheduled','updated')),
 status text NOT NULL,
 attempt integer NOT NULL,
 worker_id text,
 lease_until timestamptz,
 scheduled_at timestamptz NOT NULL,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,job_id) REFERENCES md_durable_jobs(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_durable_job_history_lookup
 ON md_durable_job_history(tenant_id,job_id,created_at,id);

CREATE OR REPLACE FUNCTION md_durable_job_history_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text;
BEGIN
 IF TG_OP='INSERT' THEN
  kind := 'enqueued';
 ELSIF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.attempt IS NOT DISTINCT FROM OLD.attempt
       AND NEW.lease_owner IS NOT DISTINCT FROM OLD.lease_owner
       AND NEW.error_code IS NOT DISTINCT FROM OLD.error_code
       AND NEW.scheduled_at IS NOT DISTINCT FROM OLD.scheduled_at THEN
  RETURN NEW;
 ELSIF NEW.status='leased' THEN
  kind := 'claimed';
 ELSIF NEW.status='completed' THEN
  kind := 'completed';
 ELSIF NEW.status='failed' THEN
  kind := 'failed';
 ELSIF NEW.status='cancelled' THEN
  kind := 'cancelled';
 ELSIF NEW.status='queued' THEN
  kind := 'rescheduled';
 ELSE
  kind := 'updated';
 END IF;
 INSERT INTO md_durable_job_history
  (tenant_id,job_id,event_type,status,attempt,worker_id,lease_until,scheduled_at,error_code)
 VALUES
  (NEW.tenant_id,NEW.id,kind,NEW.status,NEW.attempt,NEW.lease_owner,NEW.lease_until,NEW.scheduled_at,NEW.error_code);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS md_durable_job_history_on_change ON md_durable_jobs;
CREATE TRIGGER md_durable_job_history_on_change
AFTER INSERT OR UPDATE ON md_durable_jobs
FOR EACH ROW EXECUTE FUNCTION md_durable_job_history_transition();
