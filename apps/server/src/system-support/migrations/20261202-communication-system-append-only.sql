-- Communication is a tenant-scoped system audit object. Only the central
-- transaction writer may append records. User CRUD/Flows cannot mutate them.
-- This applies even when a user has broad OneEngine grants.
CREATE OR REPLACE FUNCTION md_communication_append_only_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text;
BEGIN
 IF TG_OP='DELETE' THEN target:=OLD.object_api;
 ELSE target:=NEW.object_api; END IF;
 IF target='Communication' THEN
  IF TG_OP='INSERT'
     AND current_setting('metadrive.communication_writer',true)='on' THEN
   RETURN NEW;
  END IF;
  RAISE EXCEPTION 'System Communication records are append-only'
   USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS md_communication_records_append_only ON md_records;
CREATE TRIGGER md_communication_records_append_only
 BEFORE INSERT OR UPDATE OR DELETE ON md_records
 FOR EACH ROW EXECUTE FUNCTION md_communication_append_only_guard();
DROP TRIGGER IF EXISTS md_communication_values_append_only ON md_record_values;
CREATE TRIGGER md_communication_values_append_only
 BEFORE INSERT OR UPDATE OR DELETE ON md_record_values
 FOR EACH ROW EXECUTE FUNCTION md_communication_append_only_guard();

-- Reading still requires tenant-scoped OneEngine Object/Field read permission.
-- An authorised user can read all system log entries, irrespective of the
-- sending actor or their current account status.
INSERT INTO md_sharing_settings(tenant_id,object_api,default_access,use_hierarchy)
 SELECT tenant_id,api_name,'Public Read Only',false
 FROM md_object_definitions WHERE api_name='Communication'
 ON CONFLICT(tenant_id,object_api)
 DO UPDATE SET default_access='Public Read Only',use_hierarchy=false;

-- Existing attempts were not lost. Safely bring pending rows forward so the
-- already-running worker retries promptly with the new system SQL writer.
-- Processing leases remain intact to prevent concurrent duplicate claims.
UPDATE md_communication_delivery_outbox
 SET next_attempt_at=now()
 WHERE status='pending';
