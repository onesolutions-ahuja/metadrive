CREATE TABLE IF NOT EXISTS md_webhook_subscriptions (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 api_name text NOT NULL,
 event_api_name text NOT NULL,
 credential_id uuid NOT NULL,
 relative_path text NOT NULL,
 start_replay_id bigint NOT NULL CHECK(start_replay_id>=1),
 enabled boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,api_name),
 FOREIGN KEY(tenant_id,credential_id) REFERENCES md_named_credentials(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES md_users(tenant_id,id)
);

CREATE INDEX IF NOT EXISTS md_webhook_subscriptions_event
 ON md_webhook_subscriptions(tenant_id,event_api_name,start_replay_id) WHERE enabled=true;

CREATE TABLE IF NOT EXISTS md_webhook_deliveries (
 tenant_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 subscription_id uuid NOT NULL,
 event_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','delivered','failed')),
 response_status integer,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,subscription_id,event_id),
 FOREIGN KEY(tenant_id,subscription_id)
  REFERENCES md_webhook_subscriptions(tenant_id,id),
 FOREIGN KEY(tenant_id,event_id)
  REFERENCES md_platform_event_messages(tenant_id,id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS md_webhook_deliveries_queue
 ON md_webhook_deliveries(tenant_id,status,created_at,id) WHERE status='queued';
