-- Phase 1: recoverable tenant-scoped record deletion (additive, idempotent).
-- This migration preserves existing records and relationships.
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS deletion_group_id uuid;
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS deletion_root_id uuid;

CREATE INDEX IF NOT EXISTS md_records_active_lookup
 ON md_records(tenant_id,object_api,id) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS md_records_recycle_bin
 ON md_records(tenant_id,object_api,deleted_at DESC,id) WHERE is_deleted=true;
CREATE INDEX IF NOT EXISTS md_records_deletion_group
 ON md_records(tenant_id,deletion_group_id) WHERE is_deleted=true;

-- A lookup cleared when its referenced record is deleted may be restored only
-- if the source remains active and the field has not been changed by a user.
CREATE TABLE IF NOT EXISTS md_deleted_lookup_links(
 tenant_id uuid NOT NULL,
 deletion_group_id uuid NOT NULL,
 source_record_id uuid NOT NULL,
 source_object_api text NOT NULL,
 field_api text NOT NULL,
 target_record_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,deletion_group_id,source_record_id,field_api),
 FOREIGN KEY(tenant_id,source_record_id,source_object_api)
   REFERENCES md_records(tenant_id,id,object_api) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_deleted_lookup_links_target
 ON md_deleted_lookup_links(tenant_id,deletion_group_id,target_record_id);

CREATE TABLE IF NOT EXISTS md_record_lifecycle_audit(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 record_id uuid NOT NULL,
 object_api text NOT NULL,
 deletion_group_id uuid,
 actor_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('delete','restore','purge')),
 happened_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_record_lifecycle_audit_record
 ON md_record_lifecycle_audit(tenant_id,object_api,record_id,happened_at DESC);
