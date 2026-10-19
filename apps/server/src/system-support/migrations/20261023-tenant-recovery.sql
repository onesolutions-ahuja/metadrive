-- Emergency tenant recovery: separately verified durable security evidence.
-- Private contact tokens are hashed. Secrets never enter JSON or audit logs.
CREATE TABLE IF NOT EXISTS md_tenant_recovery_contacts(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 email text NOT NULL,
 verification_hash text NOT NULL,
 verification_expires_at timestamptz NOT NULL,
 failed_attempts integer NOT NULL DEFAULT 0 CHECK(failed_attempts BETWEEN 0 AND 10),
 verified_at timestamptz,
 enrolled_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,email),
 FOREIGN KEY(tenant_id,enrolled_by) REFERENCES md_users(tenant_id,id),
 CHECK(email=lower(email))
);
CREATE TABLE IF NOT EXISTS md_tenant_recovery_cases(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 claimant_user_id uuid NOT NULL,
 opened_by_tenant_id uuid NOT NULL,
 opened_by_user_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN
  ('PENDING','VERIFIED','DISPUTED','APPROVED','INVITED','REDEEMED','REPAIRED')),
 identity_proof_status text NOT NULL DEFAULT 'PENDING' CHECK(identity_proof_status IN
  ('PENDING','VERIFIED','DISPUTED')),
 opened_at timestamptz NOT NULL DEFAULT now(),
 wait_until timestamptz NOT NULL DEFAULT (now()+interval '24 hours'),
 approved_at timestamptz,
 invitation_hash text,
 invitation_expires_at timestamptz,
 redeemed_at timestamptz,
 repaired_at timestamptz,
 PRIMARY KEY(tenant_id,id),
 UNIQUE(id),
 FOREIGN KEY(tenant_id,claimant_user_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(opened_by_tenant_id,opened_by_user_id) REFERENCES md_users(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_tenant_recovery_case_proofs(
 tenant_id uuid NOT NULL,
 case_id uuid NOT NULL,
 email text NOT NULL,
 token_hash text NOT NULL,
 token_expires_at timestamptz NOT NULL,
 failed_attempts integer NOT NULL DEFAULT 0 CHECK(failed_attempts BETWEEN 0 AND 10),
 confirmed_at timestamptz,
 disputed_at timestamptz,
 PRIMARY KEY(tenant_id,case_id,email),
 FOREIGN KEY(tenant_id,case_id) REFERENCES md_tenant_recovery_cases(tenant_id,id),
 FOREIGN KEY(tenant_id,email) REFERENCES md_tenant_recovery_contacts(tenant_id,email)
);
CREATE TABLE IF NOT EXISTS md_tenant_recovery_approvals(
 tenant_id uuid NOT NULL,
 case_id uuid NOT NULL,
 operator_tenant_id uuid NOT NULL,
 operator_user_id uuid NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,case_id,operator_tenant_id,operator_user_id),
 FOREIGN KEY(tenant_id,case_id) REFERENCES md_tenant_recovery_cases(tenant_id,id),
 FOREIGN KEY(operator_tenant_id,operator_user_id) REFERENCES md_users(tenant_id,id)
);
