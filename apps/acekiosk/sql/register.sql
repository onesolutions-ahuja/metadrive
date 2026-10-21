-- Publisher-only, idempotent AceKiosk package registration.
-- Installation, licensing, activation and RBAC are tenant-specific separate operations.
BEGIN;
INSERT INTO md_apps(api_name,label,enabled)
VALUES('AceKiosk','AceKiosk',true)
ON CONFLICT(api_name) DO NOTHING;
INSERT INTO md_app_package_versions(app_id,version,published,description,brand_color)
SELECT id,1,true,'Independent AceKiosk touchscreen interface, powered by MetaDrive Flows.','#E31B23'
FROM md_apps WHERE api_name='AceKiosk'
ON CONFLICT(app_id,version) DO UPDATE SET published=EXCLUDED.published;
INSERT INTO md_app_package_resources(app_id,version,resource_type,api_name,parent_api)
SELECT a.id,1,'Object',r.api_name,'' FROM md_apps a
CROSS JOIN (VALUES('Product'),('Order'),('OrderLine')) r(api_name)
WHERE a.api_name='AceKiosk'
ON CONFLICT DO NOTHING;
COMMIT;
