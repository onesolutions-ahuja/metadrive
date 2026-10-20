CREATE TABLE IF NOT EXISTS md_list_views (
 tenant_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 object_api text NOT NULL,
 owner_id uuid NOT NULL,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 120),
 visibility text NOT NULL CHECK(visibility IN ('private','all','groups')),
 scope text NOT NULL CHECK(scope IN ('my','all','my_team','queue')),
 filter_logic text NOT NULL DEFAULT '',
 sort_field text,
 sort_direction text NOT NULL DEFAULT 'asc' CHECK(sort_direction IN ('asc','desc')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,owner_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,object_api,sort_field)
  REFERENCES md_field_definitions(tenant_id,object_api,api_name)
);
CREATE INDEX IF NOT EXISTS md_list_views_object_owner
 ON md_list_views(tenant_id,object_api,owner_id);
CREATE TABLE IF NOT EXISTS md_list_view_columns (
 tenant_id uuid NOT NULL,
 view_id uuid NOT NULL,
 position integer NOT NULL CHECK(position>=0),
 field_api text NOT NULL,
 PRIMARY KEY(tenant_id,view_id,position),
 UNIQUE(tenant_id,view_id,field_api),
 FOREIGN KEY(tenant_id,view_id) REFERENCES md_list_views(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_list_view_filters (
 tenant_id uuid NOT NULL,
 view_id uuid NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 19),
 field_api text NOT NULL,
 operator text NOT NULL CHECK(operator IN ('eq','ne','lt','lte','gt','gte','contains','startsWith','includes','excludes','in')),
 value_text text NOT NULL DEFAULT '',
 PRIMARY KEY(tenant_id,view_id,position),
 FOREIGN KEY(tenant_id,view_id) REFERENCES md_list_views(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_list_view_filter_values (
 tenant_id uuid NOT NULL,
 view_id uuid NOT NULL,
 filter_position integer NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 99),
 value_text text NOT NULL,
 PRIMARY KEY(tenant_id,view_id,filter_position,position),
 FOREIGN KEY(tenant_id,view_id,filter_position)
  REFERENCES md_list_view_filters(tenant_id,view_id,position) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_list_view_groups (
 tenant_id uuid NOT NULL,
 view_id uuid NOT NULL,
 group_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,view_id,group_id),
 FOREIGN KEY(tenant_id,view_id) REFERENCES md_list_views(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,group_id) REFERENCES md_access_groups(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_list_view_pins (
 tenant_id uuid NOT NULL,
 user_id uuid NOT NULL,
 view_id uuid NOT NULL,
 pinned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id,view_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,view_id) REFERENCES md_list_views(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_records_list_page
 ON md_records(tenant_id,object_api,created_at,id);
CREATE INDEX IF NOT EXISTS md_records_queue_owner
 ON md_records(tenant_id,object_api,owner_queue_id,id) WHERE owner_queue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS md_record_values_text_lookup
 ON md_record_values(tenant_id,object_api,field_api,value_text) WHERE value_text IS NOT NULL;
CREATE INDEX IF NOT EXISTS md_record_values_boolean_lookup
 ON md_record_values(tenant_id,object_api,field_api,value_boolean) WHERE value_boolean IS NOT NULL;
CREATE INDEX IF NOT EXISTS md_record_policies_share_target
 ON md_record_policies(tenant_id,object_api,target_type,target_id,rule_type,access_level)
 WHERE kind='share' AND enabled;
CREATE INDEX IF NOT EXISTS md_record_policies_restriction_subject
 ON md_record_policies(tenant_id,object_api,subject_type,subject_id)
 WHERE kind='restriction' AND enabled;
CREATE TABLE IF NOT EXISTS md_search_layout_fields (
 tenant_id uuid NOT NULL,
 object_api text NOT NULL,
 field_api text NOT NULL,
 weight char(1) NOT NULL DEFAULT 'B' CHECK(weight IN ('A','B','C','D')),
 PRIMARY KEY(tenant_id,object_api,field_api),
 FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,object_api,field_api)
  REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_search_layout_columns (
 tenant_id uuid NOT NULL,
 object_api text NOT NULL,
 layout_key text NOT NULL CHECK(layout_key IN ('searchResults','lookupDialog','lookupPhoneDialog')),
 position integer NOT NULL CHECK(position BETWEEN 0 AND 499),
 field_api text NOT NULL,
 PRIMARY KEY(tenant_id,object_api,layout_key,position),
 UNIQUE(tenant_id,object_api,layout_key,field_api),
 FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,object_api,field_api)
  REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_record_search_values (
 tenant_id uuid NOT NULL,
 record_id uuid NOT NULL,
 object_api text NOT NULL,
 field_api text NOT NULL,
 weight char(1) NOT NULL CHECK(weight IN ('A','B','C','D')),
 search_vector tsvector NOT NULL,
 PRIMARY KEY(tenant_id,record_id,field_api),
 FOREIGN KEY(tenant_id,record_id,object_api)
  REFERENCES md_records(tenant_id,id,object_api) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_record_search_values_vector
 ON md_record_search_values USING gin(search_vector);
CREATE INDEX IF NOT EXISTS md_record_search_values_object
 ON md_record_search_values(tenant_id,object_api,field_api,record_id);

INSERT INTO md_search_layout_fields(tenant_id,object_api,field_api,weight)
SELECT tenant_id,object_api,api_name,
 CASE WHEN api_name='Name' THEN 'A' WHEN data_type='email' THEN 'B' ELSE 'C' END
FROM md_field_definitions
WHERE deleted_at IS NULL
 AND data_type IN ('text','email','phone','url','picklist')
ON CONFLICT(tenant_id,object_api,field_api) DO NOTHING;

CREATE OR REPLACE FUNCTION md_searchable_field_default()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.deleted_at IS NULL AND NEW.data_type IN ('text','email','phone','url','picklist') THEN
  INSERT INTO md_search_layout_fields(tenant_id,object_api,field_api,weight)
  VALUES(NEW.tenant_id,NEW.object_api,NEW.api_name,
   CASE WHEN NEW.api_name='Name' THEN 'A' WHEN NEW.data_type='email' THEN 'B' ELSE 'C' END)
  ON CONFLICT(tenant_id,object_api,field_api) DO NOTHING;
 ELSE
  DELETE FROM md_search_layout_fields
   WHERE tenant_id=NEW.tenant_id AND object_api=NEW.object_api AND field_api=NEW.api_name;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER md_searchable_field_default_trigger
AFTER INSERT OR UPDATE OF data_type,deleted_at ON md_field_definitions
FOR EACH ROW EXECUTE FUNCTION md_searchable_field_default();

CREATE OR REPLACE FUNCTION md_refresh_record_search_value(
 t uuid,rid uuid,obj text,field text,raw_value text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE configured_weight char(1);
BEGIN
 SELECT weight INTO configured_weight FROM md_search_layout_fields
 WHERE tenant_id=t AND object_api=obj AND field_api=field;
 IF configured_weight IS NULL OR raw_value IS NULL OR length(raw_value)=0 THEN
  DELETE FROM md_record_search_values
   WHERE tenant_id=t AND record_id=rid AND field_api=field;
  RETURN;
 END IF;
 INSERT INTO md_record_search_values(tenant_id,record_id,object_api,field_api,weight,search_vector)
 VALUES(t,rid,obj,field,configured_weight,to_tsvector('simple',raw_value))
 ON CONFLICT(tenant_id,record_id,field_api) DO UPDATE SET
  weight=EXCLUDED.weight,search_vector=EXCLUDED.search_vector;
END $$;

CREATE OR REPLACE FUNCTION md_record_search_values_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  PERFORM md_refresh_record_search_value(OLD.tenant_id,OLD.record_id,OLD.object_api,OLD.field_api,NULL);
  RETURN OLD;
 END IF;
 PERFORM md_refresh_record_search_value(NEW.tenant_id,NEW.record_id,NEW.object_api,NEW.field_api,NEW.value_text);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS md_record_search_values_sync_trigger ON md_record_values;
CREATE TRIGGER md_record_search_values_sync_trigger
AFTER INSERT OR UPDATE OF value_text,field_api,object_api OR DELETE ON md_record_values
FOR EACH ROW EXECUTE FUNCTION md_record_search_values_sync();

CREATE OR REPLACE FUNCTION md_search_layout_fields_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item record;
BEGIN
 IF TG_OP='DELETE' THEN
  DELETE FROM md_record_search_values
   WHERE tenant_id=OLD.tenant_id AND object_api=OLD.object_api AND field_api=OLD.field_api;
  RETURN OLD;
 END IF;
 FOR item IN
  SELECT v.record_id,v.value_text FROM md_record_values v
  WHERE v.tenant_id=NEW.tenant_id AND v.object_api=NEW.object_api AND v.field_api=NEW.field_api
 LOOP
  PERFORM md_refresh_record_search_value(NEW.tenant_id,item.record_id,NEW.object_api,NEW.field_api,item.value_text);
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER md_search_layout_fields_sync_trigger
AFTER INSERT OR UPDATE OF weight OR DELETE ON md_search_layout_fields
FOR EACH ROW EXECUTE FUNCTION md_search_layout_fields_sync();

INSERT INTO md_record_search_values(tenant_id,record_id,object_api,field_api,weight,search_vector)
SELECT v.tenant_id,v.record_id,v.object_api,v.field_api,s.weight,to_tsvector('simple',v.value_text)
FROM md_record_values v JOIN md_search_layout_fields s
 ON s.tenant_id=v.tenant_id AND s.object_api=v.object_api AND s.field_api=v.field_api
WHERE v.value_text IS NOT NULL AND length(v.value_text)>0
ON CONFLICT(tenant_id,record_id,field_api) DO UPDATE SET
 weight=EXCLUDED.weight,search_vector=EXCLUDED.search_vector;
