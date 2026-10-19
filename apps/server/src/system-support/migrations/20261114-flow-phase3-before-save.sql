-- Phase 3: read-only Get Records, Loop and pure collection transformations for before-save flows.
-- Core registry default upgrade only; tenant overrides with newer versions are preserved.
-- Never enables Create/Update/Delete, HTTP, Wait, Subflow or external actions in before-save.
UPDATE md_flow_capability_elements
 SET before_save_allowed=true,registry_version=3
 WHERE element_type IN ('Get Records','Loop','Collection Filter','Collection Sort','Transform')
   AND registry_version IN (1,2) AND before_save_allowed=false AND app_api_name IS NULL;
