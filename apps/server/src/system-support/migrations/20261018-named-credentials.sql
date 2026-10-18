-- Isolated encrypted credential storage. The SQL record never contains plaintext secrets.
CREATE TABLE IF NOT EXISTS md_named_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 name text NOT NULL,
 label text NOT NULL,
 protocol text NOT NULL CHECK(protocol IN ('HTTPS','SMTP')),
 base_url text NOT NULL,
 auth_type text NOT NULL,
 header_name text NOT NULL DEFAULT '',
 secret_ciphertext bytea,
 configuration_ciphertext bytea,
 enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,name),UNIQUE(tenant_id,id)
);
