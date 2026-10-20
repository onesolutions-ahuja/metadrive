CREATE TABLE IF NOT EXISTS md_oauth_clients(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),id uuid NOT NULL DEFAULT gen_random_uuid(),label text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,client_type text NOT NULL CHECK(client_type IN ('public','confidential')),
 secret_hash text,require_mfa boolean NOT NULL DEFAULT true,PRIMARY KEY(tenant_id,id),UNIQUE(id)
);
CREATE TABLE IF NOT EXISTS md_oauth_redirects(
 tenant_id uuid NOT NULL,client_id uuid NOT NULL,uri text NOT NULL,origin text NOT NULL,
 PRIMARY KEY(tenant_id,client_id,uri),FOREIGN KEY(tenant_id,client_id) REFERENCES md_oauth_clients(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_oauth_client_scopes(
 tenant_id uuid NOT NULL,client_id uuid NOT NULL,scope text NOT NULL CHECK(scope IN ('records:read','records:write','metadata:read','flows:execute')),
 PRIMARY KEY(tenant_id,client_id,scope),FOREIGN KEY(tenant_id,client_id) REFERENCES md_oauth_clients(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_oauth_client_users(
 tenant_id uuid NOT NULL,client_id uuid NOT NULL,user_id uuid NOT NULL,PRIMARY KEY(tenant_id,client_id,user_id),
 FOREIGN KEY(tenant_id,client_id) REFERENCES md_oauth_clients(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_oauth_consents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,client_id uuid NOT NULL,user_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,client_id) REFERENCES md_oauth_clients(tenant_id,id),FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_oauth_codes(
 code_hash text PRIMARY KEY,tenant_id uuid NOT NULL,consent_id uuid NOT NULL,redirect_uri text NOT NULL,challenge text NOT NULL,
 mfa_verified boolean NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '2 minutes',consumed_at timestamptz,
 FOREIGN KEY(tenant_id,consent_id) REFERENCES md_oauth_consents(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_oauth_consent_scopes(
 tenant_id uuid NOT NULL,consent_id uuid NOT NULL,scope text NOT NULL,PRIMARY KEY(tenant_id,consent_id,scope),
 FOREIGN KEY(tenant_id,consent_id) REFERENCES md_oauth_consents(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_oauth_tokens(
 token_hash text PRIMARY KEY,tenant_id uuid NOT NULL,consent_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('access','refresh')),
 FOREIGN KEY(tenant_id,consent_id) REFERENCES md_oauth_consents(tenant_id,id)
);
CREATE OR REPLACE FUNCTION md_oauth_token_allowed(t uuid,u uuid,h text,path text,verb text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM md_oauth_tokens WHERE token_hash=h)
 OR EXISTS(SELECT 1 FROM md_oauth_tokens b
  JOIN md_oauth_consents c ON c.tenant_id=b.tenant_id AND c.id=b.consent_id AND c.revoked_at IS NULL
  JOIN md_oauth_clients p ON p.tenant_id=c.tenant_id AND p.id=c.client_id AND p.enabled
  JOIN md_oauth_client_users a ON a.tenant_id=c.tenant_id AND a.client_id=c.client_id AND a.user_id=c.user_id
  JOIN md_oauth_consent_scopes s ON s.tenant_id=c.tenant_id AND s.consent_id=c.id
  JOIN md_oauth_client_scopes allowed ON allowed.tenant_id=c.tenant_id AND allowed.client_id=c.client_id AND allowed.scope=s.scope
  WHERE b.token_hash=h AND b.kind='access' AND b.tenant_id=t AND c.user_id=u AND md_rbac_allowed(t,u,'API','execute')
  AND (CASE s.scope
   WHEN 'records:read' THEN verb='GET' AND path ~ '^/(api/records(/|$)|services/data/v[0-9.]+/(query|queryAll|search|sobjects)(/|$))'
   WHEN 'records:write' THEN verb IN ('POST','PUT','PATCH','DELETE') AND path ~ '^/(api/records/|services/data/v[0-9.]+/sobjects/)'
   WHEN 'metadata:read' THEN verb='GET' AND path ~ '^/api/metadata/(objects|apps|pages|flows)(/|$)'
   WHEN 'flows:execute' THEN verb='POST' AND path ~ '^/api/flows/[A-Za-z][A-Za-z0-9_]*/run$'
   ELSE false END))
$$;
CREATE OR REPLACE FUNCTION md_oauth_refresh_allowed(h text,client uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT (client IS NULL AND NOT EXISTS(SELECT 1 FROM md_oauth_tokens WHERE token_hash=h))
 OR EXISTS(SELECT 1 FROM md_oauth_tokens b JOIN md_oauth_consents c ON c.tenant_id=b.tenant_id AND c.id=b.consent_id AND c.revoked_at IS NULL
  JOIN md_oauth_clients p ON p.tenant_id=c.tenant_id AND p.id=c.client_id AND p.enabled
  JOIN md_oauth_client_users a ON a.tenant_id=c.tenant_id AND a.client_id=c.client_id AND a.user_id=c.user_id
  WHERE b.token_hash=h AND b.kind='refresh' AND p.id=client AND md_user_licensed(c.tenant_id,c.user_id) AND md_rbac_allowed(c.tenant_id,c.user_id,'API','execute'))
$$;
