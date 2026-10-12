-- Aiven PostgreSQL: dedicated PLATFORM CONTROL database only.
-- Never install in a tenant's application database.
-- Apply using a migration role. No grants to tenant/API runtime roles.
CREATE TABLE IF NOT EXISTS tenant_recovery_cases (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  claimant_user_id text NOT NULL,
  requested_by text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','disputed','approved','redeemed','expired','rejected')),
  identity_proof_status text NOT NULL DEFAULT 'pending' CHECK (identity_proof_status IN ('pending','verified','rejected')),
  out_of_band_verified boolean NOT NULL DEFAULT false,
  contacts_notified boolean NOT NULL DEFAULT false,
  disputed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tenant_recovery_approvals (
  case_id uuid NOT NULL REFERENCES tenant_recovery_cases(id),
  operator_id text NOT NULL,
  operator_role text NOT NULL DEFAULT 'recovery_operator' CHECK (operator_role='recovery_operator'),
  operator_active boolean NOT NULL DEFAULT false,
  mfa_verified boolean NOT NULL DEFAULT false,
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(case_id, operator_id)
);
CREATE TABLE IF NOT EXISTS tenant_recovery_invitations (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL UNIQUE REFERENCES tenant_recovery_cases(id),
  tenant_id text NOT NULL,
  claimant_user_id text NOT NULL,
  token_sha256 char(64) NOT NULL UNIQUE,
  scope text NOT NULL CHECK (scope = 'tenant_admin_repair_only'),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '15 minutes')
);
CREATE TABLE IF NOT EXISTS tenant_recovery_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES tenant_recovery_cases(id),
  actor_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  evidence_digest char(64),
  event_metadata text
);
-- An append-only event table is protected from ordinary runtime UPDATE/DELETE.
-- Database-owner and migration permissions must be separately controlled.
CREATE OR REPLACE FUNCTION reject_recovery_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Recovery audit events are append-only'; END $$;
DROP TRIGGER IF EXISTS tenant_recovery_no_mutations ON tenant_recovery_events;
CREATE TRIGGER tenant_recovery_no_mutations BEFORE UPDATE OR DELETE ON tenant_recovery_events
FOR EACH ROW EXECUTE FUNCTION reject_recovery_event_mutation();

-- Prevent concurrent duplicate pending recoveries for the same claimant.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_recovery_single_active_case ON tenant_recovery_cases(tenant_id,claimant_user_id) WHERE status IN ('pending','approved');
