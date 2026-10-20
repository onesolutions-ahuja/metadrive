-- Shared tenant-owned media: reusable by any app, without KFC-specific Core records.
CREATE TABLE IF NOT EXISTS md_tenant_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES md_tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 255),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/gif','image/webp')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  content bytea NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES md_users(tenant_id,id),
  CHECK (octet_length(content)=byte_size)
);
CREATE INDEX IF NOT EXISTS md_tenant_media_assets_created
  ON md_tenant_media_assets(tenant_id,created_at DESC,id);
