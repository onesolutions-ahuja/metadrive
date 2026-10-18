-- Additive typed projections. Retain value_text until every reader has migrated.
-- A database trigger keeps typed projections correct for all existing write paths.
ALTER TABLE md_record_values ADD COLUMN IF NOT EXISTS value_number numeric;
ALTER TABLE md_record_values ADD COLUMN IF NOT EXISTS value_date date;
ALTER TABLE md_record_values ADD COLUMN IF NOT EXISTS value_datetime timestamptz;
ALTER TABLE md_record_values ADD COLUMN IF NOT EXISTS value_boolean boolean;

CREATE OR REPLACE FUNCTION md_record_value_typed_projection()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text;
BEGIN
 SELECT data_type INTO kind FROM md_field_definitions
 WHERE tenant_id=NEW.tenant_id AND object_api=NEW.object_api AND api_name=NEW.field_api;
 NEW.value_number:=NULL;
 NEW.value_date:=NULL;
 NEW.value_datetime:=NULL;
 NEW.value_boolean:=NULL;
 IF NEW.value_text IS NULL THEN RETURN NEW; END IF;
 IF kind IN ('number','currency','percent') THEN
   NEW.value_number:=NEW.value_text::numeric;
 ELSIF kind='date' THEN
   NEW.value_date:=NEW.value_text::date;
 ELSIF kind='datetime' THEN
   NEW.value_datetime:=NEW.value_text::timestamptz;
 ELSIF kind='boolean' THEN
   NEW.value_boolean:=NEW.value_text::boolean;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS md_record_value_typed_sync ON md_record_values;
CREATE TRIGGER md_record_value_typed_sync
BEFORE INSERT OR UPDATE OF value_text,field_api,object_api ON md_record_values
FOR EACH ROW EXECUTE FUNCTION md_record_value_typed_projection();

-- Backfill only valid historical values; invalid legacy rows remain readable
-- in value_text and can be repaired before any strict cutover.
UPDATE md_record_values v SET value_number=v.value_text::numeric
FROM md_field_definitions f
WHERE f.tenant_id=v.tenant_id AND f.object_api=v.object_api AND f.api_name=v.field_api
 AND f.data_type IN ('number','currency','percent') AND v.value_text ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$'
 AND v.value_text IS NOT NULL AND v.value_number IS NULL;
UPDATE md_record_values v SET value_boolean=v.value_text::boolean
FROM md_field_definitions f
WHERE f.tenant_id=v.tenant_id AND f.object_api=v.object_api AND f.api_name=v.field_api
 AND f.data_type='boolean' AND v.value_text IN ('true','false')
 AND v.value_boolean IS NULL;
-- Date/time backfill requires strict historical-data validation before casting.
-- New and updated records populate typed columns through the trigger.
CREATE INDEX IF NOT EXISTS md_record_values_numeric_idx ON md_record_values(tenant_id,object_api,field_api,value_number) WHERE value_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS md_record_values_date_idx ON md_record_values(tenant_id,object_api,field_api,value_date) WHERE value_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS md_record_values_datetime_idx ON md_record_values(tenant_id,object_api,field_api,value_datetime) WHERE value_datetime IS NOT NULL;
