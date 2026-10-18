-- Shared tenant metadata. Verification never follows from inserting a pending claim.
CREATE TABLE IF NOT EXISTS md_tenant_domain_claims (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 domain text NOT NULL,
 proof_token text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 PRIMARY KEY(tenant_id,domain),
 UNIQUE(domain),
 CHECK (domain=lower(domain))
);
ALTER TABLE md_tenant_domains
 ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE md_tenant_domains
 ADD COLUMN IF NOT EXISTS verified_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS md_tenant_usage_targets (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 metric text NOT NULL CHECK(metric IN ('users','records','objects','flows')),
 target_value bigint NOT NULL CHECK(target_value BETWEEN 1 AND 1000000000),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,metric)
);
