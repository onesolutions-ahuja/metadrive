ALTER TABLE md_record_values ADD COLUMN IF NOT EXISTS address_street text;
ALTER TABLE md_record_values ADD COLUMN IF NOT EXISTS address_city text;
ALTER TABLE md_record_values ADD COLUMN IF NOT EXISTS address_state text;
ALTER TABLE md_record_values ADD COLUMN IF NOT EXISTS address_postal_code text;
ALTER TABLE md_record_values ADD COLUMN IF NOT EXISTS address_country text;
