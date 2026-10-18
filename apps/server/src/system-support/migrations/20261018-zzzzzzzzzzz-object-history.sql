-- Immutable relational audit of SQL Object and Field metadata changes.
CREATE TABLE IF NOT EXISTS md_object_metadata_history (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 object_api text NOT NULL,
 revision bigint NOT NULL CHECK(revision>0),
 action text NOT NULL,
 actor_user_id uuid,
 snapshot jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,object_api,revision),
 FOREIGN KEY(tenant_id,actor_user_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_object_history_recent ON md_object_metadata_history(tenant_id,object_api,revision DESC);
CREATE OR REPLACE FUNCTION md_capture_object_metadata_history() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
 v_tenant uuid;
 v_api text;
 v_action text;
 v_snapshot jsonb;
 v_revision bigint;
BEGIN
 IF TG_OP='DELETE' THEN
  v_tenant:=OLD.tenant_id;
  IF TG_TABLE_NAME='md_field_definitions' THEN v_api:=OLD.object_api;
  ELSE v_api:=OLD.api_name; END IF;
 ELSE
  v_tenant:=NEW.tenant_id;
  IF TG_TABLE_NAME='md_field_definitions' THEN v_api:=NEW.object_api;
  ELSE v_api:=NEW.api_name; END IF;
 END IF;
 v_action:=CASE
  WHEN TG_TABLE_NAME='md_field_definitions' THEN 'Field.'||
    CASE TG_OP WHEN 'INSERT' THEN 'Added' WHEN 'UPDATE' THEN 'Updated' ELSE 'Deleted' END
  ELSE 'Object.'||
    CASE TG_OP WHEN 'INSERT' THEN 'Created' WHEN 'UPDATE' THEN 'Updated' ELSE 'Deleted' END
 END;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||v_api,0));
 SELECT jsonb_build_object(
   'id',o.id,'apiName',o.api_name,'label',o.label,'pluralLabel',o.label,
   'kind',CASE WHEN o.is_system THEN 'Standard Object' ELSE 'Custom Object' END,
   'description','',
   'fields',COALESCE((
    SELECT jsonb_agg(
     jsonb_build_object('id',f.id,'apiName',f.api_name,'label',COALESCE(f.label,f.api_name),
      'dataType',CASE f.data_type
        WHEN 'text' THEN CASE WHEN f.max_length IS NOT NULL THEN 'Text('||f.max_length::text||')' ELSE 'Text' END
        WHEN 'number' THEN 'Number' WHEN 'boolean' THEN 'Checkbox'
        WHEN 'date' THEN 'Date' WHEN 'datetime' THEN 'Date/Time'
        WHEN 'reference' THEN 'Lookup' ELSE f.data_type END,
      'required',f.required,'unique',false)
      ||CASE WHEN f.related_object IS NOT NULL THEN
       jsonb_build_object('relationship',jsonb_build_object(
        'type','Lookup','targetObject',f.related_object,
        'relationshipName',f.api_name,'childRelationshipName',f.object_api))
       ELSE '{}'::jsonb END
      ORDER BY f.api_name)
    FROM md_field_definitions f
    WHERE f.tenant_id=o.tenant_id AND f.object_api=o.api_name
   ),'[]'::jsonb)
 ) INTO v_snapshot
 FROM md_object_definitions o WHERE o.tenant_id=v_tenant AND o.api_name=v_api;
 SELECT COALESCE(MAX(revision),0)+1 INTO v_revision FROM md_object_metadata_history
 WHERE tenant_id=v_tenant AND object_api=v_api;
 INSERT INTO md_object_metadata_history(tenant_id,object_api,revision,action,snapshot)
 VALUES(v_tenant,v_api,v_revision,v_action,v_snapshot);
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS md_audit_object_metadata ON md_object_definitions;
CREATE TRIGGER md_audit_object_metadata AFTER INSERT OR UPDATE OR DELETE
 ON md_object_definitions FOR EACH ROW EXECUTE FUNCTION md_capture_object_metadata_history();
DROP TRIGGER IF EXISTS md_audit_field_metadata ON md_field_definitions;
CREATE TRIGGER md_audit_field_metadata AFTER INSERT OR UPDATE OR DELETE
 ON md_field_definitions FOR EACH ROW EXECUTE FUNCTION md_capture_object_metadata_history();
