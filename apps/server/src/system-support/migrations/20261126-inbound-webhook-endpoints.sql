-- Universal tenant/app scoped inbound webhook registry. Outbound subscriptions remain independent.
CREATE TABLE IF NOT EXISTS md_inbound_webhook_endpoints (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 app_id uuid NOT NULL REFERENCES md_apps(id),
 flow_api text NOT NULL CHECK(flow_api ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 execution_user_id uuid NOT NULL,
 provider text NOT NULL DEFAULT 'Meta' CHECK(provider IN ('Meta','HmacSha256')),
 verify_token_digest bytea NOT NULL,
 signature_secret_ciphertext bytea NOT NULL,
 encryption_key_id text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,api_name),
 FOREIGN KEY(tenant_id,execution_user_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_inbound_webhook_endpoints_app
 ON md_inbound_webhook_endpoints(tenant_id,app_id) WHERE enabled=true;
CREATE TABLE IF NOT EXISTS md_inbound_webhook_events (
 tenant_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 endpoint_id uuid NOT NULL,
 payload jsonb NOT NULL,
 payload_hash text NOT NULL,
 status text NOT NULL DEFAULT 'received' CHECK(status IN ('received','completed','failed')),
 error_code text,
 received_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,
 PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,endpoint_id,payload_hash),
 FOREIGN KEY(tenant_id,endpoint_id) REFERENCES md_inbound_webhook_endpoints(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_inbound_webhook_events_status
 ON md_inbound_webhook_events(tenant_id,status,received_at);
