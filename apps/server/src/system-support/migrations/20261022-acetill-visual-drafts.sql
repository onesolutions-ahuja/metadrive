-- The live Acetill React terminal remains the original design.
-- Visual editor changes are saved as drafts, never auto-published.
CREATE TABLE IF NOT EXISTS md_acetill_visual_styles (
  tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id) ON DELETE CASCADE,
  draft_styles jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(draft_styles)='object'),
  published_styles jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(published_styles)='object'),
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
