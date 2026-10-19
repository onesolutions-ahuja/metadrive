UPDATE md_flow_definitions SET active=false
WHERE active=true AND archived=true;

WITH ranked_active_versions AS (
 SELECT tenant_id,api_name,id,
  row_number() OVER (PARTITION BY tenant_id,api_name ORDER BY version DESC,id DESC) AS active_position
 FROM md_flow_definitions
 WHERE active=true AND archived=false
)
UPDATE md_flow_definitions f SET active=false
FROM ranked_active_versions r
WHERE f.tenant_id=r.tenant_id AND f.id=r.id AND r.active_position>1;

UPDATE md_flow_trigger_subscriptions s SET active=false,updated_at=now()
FROM md_flow_definitions f
WHERE s.tenant_id=f.tenant_id AND s.flow_id=f.id AND s.active=true
 AND (f.active=false OR f.archived=true);

CREATE UNIQUE INDEX IF NOT EXISTS md_flow_definitions_one_active_version
 ON md_flow_definitions(tenant_id,api_name) WHERE active=true;
