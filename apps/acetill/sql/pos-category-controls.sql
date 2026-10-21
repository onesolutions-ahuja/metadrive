-- Acetill: idempotent, tenant-aware POS category configuration.
-- Run only for a tenant that has installed Acetill. SQL remains backend-only.
-- Uses existing MenuCategory records; no hardcoded names or tab positions.
BEGIN;
INSERT INTO md_field_definitions(tenant_id,object_api,api_name,label,data_type,default_value,description)
SELECT t.id,'MenuCategory',p.api,p.label,p.dtype,p.default_value,p.description
FROM md_tenants t CROSS JOIN (VALUES
 ('IsVisiblePOS','Visible in POS','boolean','true','Show this category in Acetill POS'),
 ('POSSortOrder','POS Sort Order','number',NULL,'Acetill POS category tab ordering')
) p(api,label,dtype,default_value,description)
WHERE EXISTS(SELECT 1 FROM md_object_definitions o
  WHERE o.tenant_id=t.id AND o.api_name='MenuCategory')
  AND EXISTS(SELECT 1 FROM md_flow_definitions f
  WHERE f.tenant_id=t.id AND f.api_name='AcetillGetCategories' AND f.archived=false)
ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING;

INSERT INTO md_record_values(tenant_id,record_id,object_api,field_api,value_boolean)
SELECT r.tenant_id,r.id,'MenuCategory','IsVisiblePOS',true
FROM md_records r
WHERE r.object_api='MenuCategory' AND r.deleted_at IS NULL
  AND EXISTS(SELECT 1 FROM md_flow_definitions f
    WHERE f.tenant_id=r.tenant_id AND f.api_name='AcetillGetCategories' AND f.archived=false)
ON CONFLICT(tenant_id,record_id,field_api) DO NOTHING;

INSERT INTO md_record_values(tenant_id,record_id,object_api,field_api,value_number)
SELECT r.tenant_id,r.id,'MenuCategory','POSSortOrder',ord.value_number
FROM md_records r JOIN md_record_values ord
 ON ord.tenant_id=r.tenant_id AND ord.record_id=r.id
 AND ord.object_api='MenuCategory' AND ord.field_api='DisplayOrder'
WHERE r.object_api='MenuCategory' AND r.deleted_at IS NULL
  AND EXISTS(SELECT 1 FROM md_flow_definitions f
    WHERE f.tenant_id=r.tenant_id AND f.api_name='AcetillGetCategories' AND f.archived=false)
ON CONFLICT(tenant_id,record_id,field_api) DO NOTHING;

-- Existing NULL projections may have been created by older metadata seeders.
-- Backfill only NULL values; never replace a tenant's existing POS preferences.
UPDATE md_record_values v SET value_boolean=true
WHERE v.object_api='MenuCategory' AND v.field_api='IsVisiblePOS'
 AND v.value_boolean IS NULL
 AND EXISTS(SELECT 1 FROM md_flow_definitions f WHERE f.tenant_id=v.tenant_id
   AND f.api_name='AcetillGetCategories' AND f.archived=false);

UPDATE md_record_values v SET value_number=ord.value_number
FROM md_record_values ord
WHERE ord.tenant_id=v.tenant_id AND ord.record_id=v.record_id
 AND ord.object_api='MenuCategory' AND ord.field_api='DisplayOrder'
 AND v.object_api='MenuCategory' AND v.field_api='POSSortOrder'
 AND v.value_number IS NULL
 AND EXISTS(SELECT 1 FROM md_flow_definitions f WHERE f.tenant_id=v.tenant_id
   AND f.api_name='AcetillGetCategories' AND f.archived=false);

-- Upgrade the generated category Flow only if it still has the original
-- Active/DisplayOrder settings. Do not overwrite customer-edited Flows.
UPDATE md_flow_editor_values v SET value_text='POSSortOrder'
FROM md_flow_definitions f
WHERE v.tenant_id=f.tenant_id AND v.flow_id=f.id
  AND f.api_name='AcetillGetCategories' AND f.archived=false
  AND v.property_path='/builder/elements/1/config/sortField' AND v.value_text='DisplayOrder';
UPDATE md_flow_editor_values v SET value_text='IsVisiblePOS'
FROM md_flow_definitions f
WHERE v.tenant_id=f.tenant_id AND v.flow_id=f.id
  AND f.api_name='AcetillGetCategories' AND f.archived=false
  AND v.property_path='/builder/elements/1/config/conditions/0/field' AND v.value_text='Active';

-- Preserve the general Active filter in migrated flows that use POS visibility.
INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
SELECT f.tenant_id,f.id,v.path,v.kind,v.val
FROM md_flow_definitions f
JOIN md_flow_editor_values c
 ON c.tenant_id=f.tenant_id AND c.flow_id=f.id
 AND c.property_path='/builder/elements/1/config/conditions/0/field'
 AND c.value_text='IsVisiblePOS'
CROSS JOIN (VALUES
 ('/builder/elements/1/config/conditions/1','object',NULL),
 ('/builder/elements/1/config/conditions/1/field','string','Active'),
 ('/builder/elements/1/config/conditions/1/operator','string','Equals'),
 ('/builder/elements/1/config/conditions/1/value','boolean','true')
) v(path,kind,val)
WHERE f.api_name='AcetillGetCategories' AND f.archived=false
 AND NOT EXISTS(SELECT 1 FROM md_flow_editor_values existing
  WHERE existing.tenant_id=f.tenant_id AND existing.flow_id=f.id
   AND existing.property_path='/builder/elements/1/config/conditions/1')
ON CONFLICT(tenant_id,flow_id,property_path) DO NOTHING;
COMMIT;
