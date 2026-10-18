CREATE TABLE IF NOT EXISTS md_dashboard_subscriptions(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 dashboard_api text NOT NULL,
 created_by uuid NOT NULL,
 configuration jsonb NOT NULL CHECK(jsonb_typeof(configuration)='object'),
 active boolean NOT NULL DEFAULT false,
 next_run_at timestamptz NOT NULL,
 last_run_at timestamptz,
 last_run_status text NOT NULL DEFAULT 'Never' CHECK(last_run_status IN ('Never','Success','Failed')),
 last_run_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_dashboard_subscriptions_due ON md_dashboard_subscriptions(next_run_at)
 WHERE active=true;
CREATE TABLE IF NOT EXISTS md_dashboard_subscription_runs(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 subscription_id uuid NOT NULL,
 requested_by uuid NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 status text NOT NULL CHECK(status IN ('pending','success','failed')),
 error text,
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,subscription_id) REFERENCES md_dashboard_subscriptions(tenant_id,id),
 FOREIGN KEY(tenant_id,requested_by) REFERENCES md_users(tenant_id,id)
);
