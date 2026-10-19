-- Durable tenant-scoped connector connectivity observations.
CREATE TABLE IF NOT EXISTS md_integration_connection_tests(
 tenant_id uuid NOT NULL,
 connection_api text NOT NULL,
 connection_kind text NOT NULL DEFAULT 'integration-connections' CHECK(connection_kind='integration-connections'),
 status text NOT NULL CHECK(status IN ('Connected','Failed','Not configured','Test unavailable')),
 message text NOT NULL DEFAULT '',
 tested_by uuid NOT NULL,
 tested_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,connection_api),
 FOREIGN KEY(tenant_id,connection_kind,connection_api) REFERENCES md_system_definitions(tenant_id,kind,api_name),
 FOREIGN KEY(tenant_id,tested_by) REFERENCES md_users(tenant_id,id)
);
