-- Global Quick Actions use one tenant metadata registry and shared execution permissions.
CREATE TABLE IF NOT EXISTS md_global_quick_actions(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 action_id text NOT NULL CHECK(action_id ~ '^[A-Za-z][A-Za-z0-9_-]*$' AND length(action_id)<=100),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
 behavior text NOT NULL CHECK(behavior IN ('Create Record','Run Flow','Send Email')),
 enabled boolean NOT NULL DEFAULT true,
 target_object_api text,
 flow_api_name text,
 credential_id uuid,
 from_email text,
 sort_order integer NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,action_id),
 FOREIGN KEY(tenant_id,target_object_api) REFERENCES md_object_definitions(tenant_id,api_name),
 CHECK(
 (behavior='Create Record' AND target_object_api IS NOT NULL AND flow_api_name IS NULL
   AND credential_id IS NULL AND from_email IS NULL)
 OR (behavior='Run Flow' AND flow_api_name IS NOT NULL AND target_object_api IS NULL
   AND credential_id IS NULL AND from_email IS NULL)
 OR (behavior='Send Email' AND credential_id IS NOT NULL AND from_email IS NOT NULL
   AND length(from_email)<=254 AND from_email~'^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
   AND target_object_api IS NULL AND flow_api_name IS NULL))
);
CREATE INDEX IF NOT EXISTS md_global_quick_actions_active
 ON md_global_quick_actions(tenant_id,sort_order,action_id) WHERE enabled=true;
