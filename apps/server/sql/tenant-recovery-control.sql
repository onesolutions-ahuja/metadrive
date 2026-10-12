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
  operator_id text NOT NULL CHECK (length(trim(operator_id)) > 0),
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

-- Single active case per claimant, enforced against concurrent intake.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_recovery_single_active_case ON tenant_recovery_cases(tenant_id,claimant_user_id) WHERE status IN ('pending','approved');

-- Recovery contact factors are enrolled and verified while the tenant is active.
-- Case challenges are one-time and never hold plaintext secrets.
CREATE TABLE IF NOT EXISTS tenant_recovery_contacts (
  tenant_id text NOT NULL,
  email text NOT NULL,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  challenge_digest char(64),
  challenge_expires_at timestamptz,
  PRIMARY KEY (tenant_id, email)
);
CREATE TABLE IF NOT EXISTS tenant_recovery_contact_proofs (
  case_id uuid NOT NULL REFERENCES tenant_recovery_cases(id),
  contact_email text NOT NULL,
  challenge_digest char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  PRIMARY KEY (case_id, contact_email)
);
CREATE TABLE IF NOT EXISTS tenant_recovery_repair_grants (
  case_id uuid PRIMARY KEY REFERENCES tenant_recovery_cases(id),
  tenant_id text NOT NULL,
  claimant_user_id text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  CHECK (consumed_at IS NULL OR consumed_at >= issued_at)
);
-- No runtime role may write to this schema outside the recovery service.

-- Durable OTP replay barrier shared across API instances.
CREATE TABLE IF NOT EXISTS tenant_recovery_mfa_steps (
  user_id text NOT NULL,
  time_step bigint NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,time_step)
);

-- Proof cannot be completed until notification to every enrolled contact finishes.
ALTER TABLE tenant_recovery_cases
  ADD COLUMN IF NOT EXISTS notification_dispatch_complete boolean NOT NULL DEFAULT false;
