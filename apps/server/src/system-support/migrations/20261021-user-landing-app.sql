ALTER TABLE md_users
  ADD COLUMN IF NOT EXISTS landing_app_api text NOT NULL DEFAULT 'Setup';
