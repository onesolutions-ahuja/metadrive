CREATE TABLE IF NOT EXISTS md_password_recovery_settings (
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id),
 smtp_credential_id uuid,
 from_email text NOT NULL DEFAULT '',
 policy jsonb NOT NULL DEFAULT '{"method":"OTP","defaultChannel":"email","allowedChannels":["email"]}'::jsonb
   CHECK (jsonb_typeof(policy)='object'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,smtp_credential_id) REFERENCES md_named_credentials(tenant_id,id)
);
