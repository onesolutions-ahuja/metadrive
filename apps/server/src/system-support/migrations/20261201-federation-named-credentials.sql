ALTER TABLE md_identity_providers
 ADD COLUMN IF NOT EXISTS token_credential_id uuid,
 ADD COLUMN IF NOT EXISTS jwks_credential_id uuid;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='md_identity_providers_token_credential_fk') THEN
  ALTER TABLE md_identity_providers ADD CONSTRAINT md_identity_providers_token_credential_fk
   FOREIGN KEY(tenant_id,token_credential_id) REFERENCES md_named_credentials(tenant_id,id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='md_identity_providers_jwks_credential_fk') THEN
  ALTER TABLE md_identity_providers ADD CONSTRAINT md_identity_providers_jwks_credential_fk
   FOREIGN KEY(tenant_id,jwks_credential_id) REFERENCES md_named_credentials(tenant_id,id);
 END IF;
END $$;
