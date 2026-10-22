-- The live Acetill React terminal remains the original design.
-- Visual editor changes are saved as drafts, never auto-published.
CREATE TABLE IF NOT EXISTS md_acetill_visual_styles (
  tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id) ON DELETE CASCADE,
  draft_styles jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(draft_styles)='object'),
  published_styles jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(published_styles)='object'),
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Existing entitled tenants need a visible Page Builder entry now; new installs
-- receive the same draft via the explicit Acetill installation hook.
INSERT INTO md_page_definitions(tenant_id,api_name,title,enabled)
SELECT i.tenant_id,'AcetillRegisterEditable','Acetill Terminal (Editable Copy)',true
FROM md_app_installations i
JOIN md_apps a ON a.id=i.app_id AND a.api_name='Acetill' AND a.enabled=true
JOIN md_app_entitlements e ON e.tenant_id=i.tenant_id AND e.app_id=i.app_id
WHERE e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())
ON CONFLICT(tenant_id,api_name) DO NOTHING;

INSERT INTO md_lightning_page_details
 (tenant_id,page_id,page_type,target_object,layout_mode,template,canvas_width,canvas_height,status,devices,revision)
SELECT p.tenant_id,p.id,'App Page','','template','main-sidebar',1440,900,'Draft',ARRAY['Desktop','Phone']::text[],1
FROM md_page_definitions p
JOIN md_app_installations i ON i.tenant_id=p.tenant_id
JOIN md_apps a ON a.id=i.app_id AND a.api_name='Acetill' AND a.enabled=true
JOIN md_app_entitlements e ON e.tenant_id=i.tenant_id AND e.app_id=i.app_id
WHERE p.api_name='AcetillRegisterEditable' AND p.enabled=true
  AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())
ON CONFLICT(tenant_id,page_id) DO NOTHING;
