-- Tenant-scoped, body-free audit trail for integration HTTP traffic.
-- Payloads, authorization headers, query strings and credentials are deliberately not stored.
CREATE TABLE IF NOT EXISTS md_integration_api_logs (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id) ON DELETE CASCADE,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 direction text NOT NULL CHECK(direction IN ('Inbound','Outbound')),
 transport text NOT NULL DEFAULT 'HTTP' CHECK(transport IN ('HTTP','Webhook')),
 provider text NOT NULL DEFAULT 'Unknown',
 credential_id uuid,
 actor_user_id uuid,
 endpoint text NOT NULL CHECK(length(endpoint)<=2048),
 method text NOT NULL CHECK(method IN ('GET','POST','PUT','PATCH','DELETE','OTHER')),
 status_code integer CHECK(status_code IS NULL OR status_code BETWEEN 100 AND 599),
 outcome text NOT NULL CHECK(outcome IN ('success','http_error','network_error','rejected')),
 duration_ms integer NOT NULL DEFAULT 0 CHECK(duration_ms>=0),
 request_bytes integer NOT NULL DEFAULT 0 CHECK(request_bytes>=0),
 response_bytes integer NOT NULL DEFAULT 0 CHECK(response_bytes>=0),
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_integration_api_logs_tenant_time
 ON md_integration_api_logs(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS md_integration_api_logs_tenant_direction_time
 ON md_integration_api_logs(tenant_id,direction,created_at DESC);
CREATE INDEX IF NOT EXISTS md_integration_api_logs_tenant_credential_time
 ON md_integration_api_logs(tenant_id,credential_id,created_at DESC)
 WHERE credential_id IS NOT NULL;
