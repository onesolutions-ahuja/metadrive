-- Dashboard delivery uses shared metadata and encrypted Named Credentials.
-- SQL owns schedule state, which can be picked up by the shared durable job worker.
CREATE TABLE IF NOT EXISTS md_dashboard_subscriptions(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 dashboard_kind text NOT NULL DEFAULT 'dashboards' CHECK(dashboard_kind='dashboards'),
 dashboard_api text NOT NULL,
 owner_user_id uuid NOT NULL,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 200),
 frequency text NOT NULL CHECK(frequency IN ('Daily','Weekly')),
 local_time time NOT NULL,
 time_zone text NOT NULL,
 day_of_week integer CHECK(day_of_week BETWEEN 0 AND 6),
 recipient_user_ids uuid[] NOT NULL,
 credential_id uuid NOT NULL,
 from_email text NOT NULL,
 active boolean NOT NULL DEFAULT false,
 save_snapshots boolean NOT NULL DEFAULT true,
 next_run_at timestamptz NOT NULL,
 last_run_at timestamptz,
 last_run_status text NOT NULL DEFAULT 'Never' CHECK(last_run_status IN ('Never','Pending','Success','Failed')),
 last_run_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,dashboard_kind,dashboard_api) REFERENCES md_system_definitions(tenant_id,kind,api_name),
 FOREIGN KEY(tenant_id,owner_user_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,credential_id) REFERENCES md_named_credentials(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_dashboard_subscriptions_due ON md_dashboard_subscriptions(next_run_at)
 WHERE active=true;
