-- Explicit tenant-scoped, evidence-backed provider reconciliation; never replay unknown outcomes automatically.
ALTER TABLE md_outbound_execution_receipts
 DROP CONSTRAINT IF EXISTS md_outbound_execution_receipts_state_check;
ALTER TABLE md_outbound_execution_receipts
 ADD CONSTRAINT md_outbound_execution_receipts_state_check
 CHECK(state IN ('pending','completed','uncertain','cleared'));
CREATE TABLE IF NOT EXISTS md_outbound_receipt_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 receipt_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN ('confirmed_not_sent','provider_idempotent_retry','acknowledge')),
 evidence_reference text NOT NULL CHECK(length(evidence_reference) BETWEEN 4 AND 256),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,receipt_id) REFERENCES md_outbound_execution_receipts(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_outbound_receipt_audit_lookup
 ON md_outbound_receipt_audit(tenant_id,receipt_id,created_at,id);
