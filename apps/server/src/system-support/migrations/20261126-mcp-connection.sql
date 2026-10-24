-- MCP credentials are explicitly bound to one HTTPS resource and retain central RBAC.
ALTER TABLE md_oauth_consents ADD COLUMN IF NOT EXISTS resource text;
ALTER TABLE md_oauth_client_scopes DROP CONSTRAINT IF EXISTS md_oauth_client_scopes_scope_check;
ALTER TABLE md_oauth_client_scopes ADD CONSTRAINT md_oauth_client_scopes_scope_check
 CHECK(scope IN ('records:read','records:write','metadata:read','flows:execute','mcp:access','operations:manage'));
INSERT INTO md_system_permission_catalogue(permission_key,label,description,resource,action) VALUES
 ('platformOperations:read','Read server operations','Inspect server service status and logs','PlatformOperations','read'),
 ('platformOperations:manage','Manage server operations','Restart services and activate staged releases','PlatformOperations','manage')
ON CONFLICT(permission_key) DO NOTHING;
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
   WHEN 'mcp:access' THEN path='/api/mcp' AND verb IN ('POST','GET','DELETE')
   WHEN 'operations:manage' THEN false
   WHEN 'records:read' THEN verb='GET' AND path ~ '^/(api/records(/|$)|services/data/v[0-9.]+/(query|queryAll|search|sobjects)(/|$))'
   WHEN 'records:write' THEN verb IN ('POST','PUT','PATCH','DELETE') AND path ~ '^/(api/records/|services/data/v[0-9.]+/sobjects/)'
   WHEN 'metadata:read' THEN verb='GET' AND path ~ '^/api/metadata/(objects|apps|pages|flows)(/|$)'
   WHEN 'flows:execute' THEN verb='POST' AND path ~ '^/api/flows/[A-Za-z][A-Za-z0-9_]*/run$'
   ELSE false END))
$$;
