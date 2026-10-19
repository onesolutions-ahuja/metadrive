-- Phase 1: unlock validated Core Flow elements and supported trigger types.
-- Only migrate the version-one defaults. Future customer/administrator overrides with
-- a higher registry_version are not reset, and published Flow graphs remain untouched.
UPDATE md_flow_capability_flow_types
SET create_enabled=true, registry_version=2
WHERE flow_type IN ('Record-Triggered Flow','Schedule-Triggered Flow',
  'Platform Event-Triggered Flow')
  AND create_enabled=false AND registry_version=1 AND validate_enabled=true;

WITH unlocked AS (
 UPDATE md_flow_capability_elements
 SET builder_enabled=true,registry_version=2
 WHERE element_type IN ('Get Records','Update Records','Delete Records','Subflow',
  'Collection Filter','Collection Sort','Transform','Publish Platform Event')
  AND builder_enabled=false AND registry_version=1
 RETURNING element_type
)
UPDATE md_flow_capability_element_flows AS relation
SET builder_allowed=true
FROM unlocked
WHERE relation.element_type=unlocked.element_type
  AND relation.builder_allowed=false;

-- Elements remain excluded from invalid contexts by existing relational
-- element/flow compatibility rows and before_save_allowed=false.
-- Platform Event-Triggered Flows may not recursively publish events.
