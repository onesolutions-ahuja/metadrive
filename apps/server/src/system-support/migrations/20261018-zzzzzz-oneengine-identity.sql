-- Preserve existing tenant grants and assignments when adopting the OneEngine name.
-- Never create a second wildcard grant or change another tenant's permission set.
UPDATE md_permission_sets target
SET api_name='OneEngine'
WHERE target.api_name='TenantDeveloper'
  AND NOT EXISTS (
    SELECT 1 FROM md_permission_sets present
    WHERE present.tenant_id=target.tenant_id AND present.api_name='OneEngine'
  );
