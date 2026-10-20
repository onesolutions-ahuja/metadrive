CREATE TABLE IF NOT EXISTS md_session_policies(
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id),
 access_minutes integer NOT NULL DEFAULT 60 CHECK(access_minutes BETWEEN 5 AND 1440),
 refresh_minutes integer NOT NULL DEFAULT 43200 CHECK(refresh_minutes BETWEEN 5 AND 43200),
 idle_minutes integer NOT NULL DEFAULT 60 CHECK(idle_minutes BETWEEN 5 AND 1440),
 require_mfa boolean NOT NULL DEFAULT false,
 frame_policy text NOT NULL DEFAULT 'DENY' CHECK(frame_policy IN ('DENY','SAMEORIGIN')),
 csp_enabled boolean NOT NULL DEFAULT true
);
INSERT INTO md_session_policies(tenant_id) SELECT id FROM md_tenants ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS md_login_ip_ranges(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 profile_id uuid,kind text NOT NULL CHECK(kind IN ('login','trusted')),network cidr NOT NULL,
 FOREIGN KEY(tenant_id,profile_id) REFERENCES md_profiles(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_login_hours(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 profile_id uuid,weekday integer NOT NULL CHECK(weekday BETWEEN 1 AND 7),
 start_minute integer NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
 end_minute integer NOT NULL CHECK(end_minute BETWEEN 1 AND 1440),
 timezone text NOT NULL DEFAULT 'Europe/London',CHECK(start_minute<end_minute),
 FOREIGN KEY(tenant_id,profile_id) REFERENCES md_profiles(tenant_id,id)
);
ALTER TABLE md_sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE md_sessions ADD COLUMN IF NOT EXISTS source_ip inet;
-- Legacy access/refresh pairs cannot be safely reconstructed. Sign them out once.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='md_sessions' AND column_name='family_id') THEN
  UPDATE md_sessions SET revoked_at=now() WHERE revoked_at IS NULL;
 END IF;
END $$;
ALTER TABLE md_sessions ADD COLUMN IF NOT EXISTS family_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE md_refresh_sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE md_refresh_sessions ADD COLUMN IF NOT EXISTS absolute_expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days';
ALTER TABLE md_refresh_sessions ADD COLUMN IF NOT EXISTS source_ip inet;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='md_refresh_sessions' AND column_name='family_id') THEN
  UPDATE md_refresh_sessions SET revoked_at=now() WHERE revoked_at IS NULL;
 END IF;
END $$;
ALTER TABLE md_refresh_sessions ADD COLUMN IF NOT EXISTS family_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE TABLE IF NOT EXISTS md_mfa_backup_codes(
 tenant_id uuid NOT NULL,user_id uuid NOT NULL,code_hash text NOT NULL,used_at timestamptz,
 PRIMARY KEY(tenant_id,user_id,code_hash),FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE
);
ALTER TABLE md_mfa_login_challenges ADD COLUMN IF NOT EXISTS source_ip inet;
CREATE TABLE IF NOT EXISTS md_webauthn_credentials(
 tenant_id uuid NOT NULL,user_id uuid NOT NULL,credential_id text NOT NULL,public_key bytea NOT NULL,
 counter bigint NOT NULL DEFAULT 0,label text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,credential_id),FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_webauthn_challenges(
 token_hash text PRIMARY KEY,tenant_id uuid NOT NULL,user_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('register','authenticate')),challenge text NOT NULL,
 origin text NOT NULL,rp_id text NOT NULL,mfa_challenge_hash text,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',consumed_at timestamptz,
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_identity_providers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 label text NOT NULL,protocol text NOT NULL CHECK(protocol IN ('oidc','saml')),enabled boolean NOT NULL DEFAULT false,
 issuer text NOT NULL,authorization_url text NOT NULL,token_url text NOT NULL DEFAULT '',jwks_url text NOT NULL DEFAULT '',
 client_id text NOT NULL DEFAULT '',secret_ciphertext bytea,key_id text,certificate text NOT NULL DEFAULT '',
 UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_federated_identities(
 tenant_id uuid NOT NULL,provider_id uuid NOT NULL,subject text NOT NULL,user_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,provider_id,subject),UNIQUE(tenant_id,provider_id,user_id),
 FOREIGN KEY(tenant_id,provider_id) REFERENCES md_identity_providers(tenant_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_federation_requests(
 state_hash text PRIMARY KEY,tenant_id uuid NOT NULL,provider_id uuid NOT NULL,
 browser_hash text NOT NULL,nonce text NOT NULL,verifier_ciphertext bytea,key_id text,origin text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',consumed_at timestamptz,
 FOREIGN KEY(tenant_id,provider_id) REFERENCES md_identity_providers(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_saml_request_ids(
 tenant_id uuid NOT NULL,provider_id uuid NOT NULL,request_id text NOT NULL,value text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,provider_id,request_id),
 FOREIGN KEY(tenant_id,provider_id) REFERENCES md_identity_providers(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_federation_tickets(
 token_hash text PRIMARY KEY,tenant_id uuid NOT NULL,user_id uuid NOT NULL,origin text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '1 minute',consumed_at timestamptz,
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);
-- One reusable SQL boundary predicate for login, refresh and every authenticated request.
CREATE OR REPLACE FUNCTION md_login_boundary_allowed(t uuid,u uuid,ip inet)
RETURNS boolean LANGUAGE sql STABLE AS $$
 WITH scopes AS (
  SELECT NULL::uuid AS profile_id UNION SELECT profile_id FROM md_user_profiles WHERE tenant_id=t AND user_id=u
 ), clock AS (SELECT h.*,now() AT TIME ZONE h.timezone AS local_time FROM md_login_hours h WHERE h.tenant_id=t)
 SELECT NOT EXISTS(SELECT 1 FROM scopes s WHERE
  (EXISTS(SELECT 1 FROM md_login_ip_ranges r WHERE r.tenant_id=t AND r.kind='login' AND r.profile_id IS NOT DISTINCT FROM s.profile_id)
   AND NOT EXISTS(SELECT 1 FROM md_login_ip_ranges r WHERE r.tenant_id=t AND r.kind='login' AND r.profile_id IS NOT DISTINCT FROM s.profile_id AND ip <<= r.network))
  OR (EXISTS(SELECT 1 FROM clock h WHERE h.profile_id IS NOT DISTINCT FROM s.profile_id)
   AND NOT EXISTS(SELECT 1 FROM clock h WHERE h.profile_id IS NOT DISTINCT FROM s.profile_id
    AND extract(isodow FROM h.local_time)=h.weekday
    AND extract(hour FROM h.local_time)*60+extract(minute FROM h.local_time)>=h.start_minute
    AND extract(hour FROM h.local_time)*60+extract(minute FROM h.local_time)<h.end_minute)))
$$;
