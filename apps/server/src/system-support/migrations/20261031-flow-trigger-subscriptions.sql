CREATE TABLE IF NOT EXISTS md_flow_trigger_subscriptions (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 flow_id uuid NOT NULL,
 flow_type text NOT NULL CHECK(flow_type IN (
  'Record-Triggered Flow','Schedule-Triggered Flow','Platform Event-Triggered Flow')),
 trigger_key text NOT NULL CHECK(length(trigger_key) BETWEEN 1 AND 255),
 app_api_name text,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,flow_id),
 FOREIGN KEY(tenant_id,flow_id) REFERENCES md_flow_definitions(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_flow_trigger_subscriptions_dispatch
 ON md_flow_trigger_subscriptions(tenant_id,flow_type,trigger_key,flow_id) WHERE active=true;
INSERT INTO md_flow_trigger_subscriptions
 (tenant_id,flow_id,flow_type,trigger_key,app_api_name,active)
SELECT DISTINCT ON (f.tenant_id,f.id) f.tenant_id,f.id,f.flow_type,
 COALESCE(object_value.value_text,event_value.value_text),app_value.value_text,true
FROM md_flow_definitions f
JOIN md_flow_editor_values start_type
 ON start_type.tenant_id=f.tenant_id AND start_type.flow_id=f.id
 AND start_type.property_path ~ '^/builder/elements/[0-9]+/type$'
 AND start_type.value_text='Start'
LEFT JOIN md_flow_editor_values object_value
 ON object_value.tenant_id=f.tenant_id AND object_value.flow_id=f.id
 AND object_value.property_path=regexp_replace(start_type.property_path,
  '/type$','/config/object')
LEFT JOIN md_flow_editor_values event_value
 ON event_value.tenant_id=f.tenant_id AND event_value.flow_id=f.id
 AND event_value.property_path=regexp_replace(start_type.property_path,
  '/type$','/config/eventName')
LEFT JOIN md_flow_editor_values app_value
 ON app_value.tenant_id=f.tenant_id AND app_value.flow_id=f.id
 AND app_value.property_path='/builder/appApiName'
WHERE f.active=true AND f.archived=false
 AND f.flow_type IN ('Record-Triggered Flow','Schedule-Triggered Flow','Platform Event-Triggered Flow')
 AND COALESCE(object_value.value_text,event_value.value_text) ~ '^[A-Za-z][A-Za-z0-9_]*$'
ORDER BY f.tenant_id,f.id,start_type.property_path
ON CONFLICT(tenant_id,flow_id) DO UPDATE SET flow_type=EXCLUDED.flow_type,
 trigger_key=EXCLUDED.trigger_key,app_api_name=EXCLUDED.app_api_name,
 active=true,updated_at=now();
