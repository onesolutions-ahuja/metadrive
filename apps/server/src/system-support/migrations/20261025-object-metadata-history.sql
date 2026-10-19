-- Versioned object metadata history in typed relational path/value rows.
-- Existing objects retain current layout data without fabricating historical revisions.
CREATE TABLE IF NOT EXISTS md_object_metadata_history(
 tenant_id uuid NOT NULL,
 object_api text NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 action text NOT NULL DEFAULT 'Updated',
 actor_user_id uuid,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,object_api,revision),
 FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name),
 FOREIGN KEY(tenant_id,actor_user_id) REFERENCES md_users(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_object_metadata_history_values(
 tenant_id uuid NOT NULL,
 object_api text NOT NULL,
 revision integer NOT NULL,
 property_path text NOT NULL CHECK(length(property_path) BETWEEN 1 AND 1024),
 value_kind text NOT NULL CHECK(value_kind IN ('string','number','boolean','null','array','object')),
 value_text text,
 PRIMARY KEY(tenant_id,object_api,revision,property_path),
 FOREIGN KEY(tenant_id,object_api,revision)
   REFERENCES md_object_metadata_history(tenant_id,object_api,revision) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_object_metadata_history_recent
 ON md_object_metadata_history(tenant_id,object_api,revision DESC);
