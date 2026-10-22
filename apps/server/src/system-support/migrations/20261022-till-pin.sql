-- PIN material never stored in a generic readable User record field.
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS till_pin_hash text;
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS till_pin_failures integer NOT NULL DEFAULT 0;
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS till_pin_locked_until timestamptz;
