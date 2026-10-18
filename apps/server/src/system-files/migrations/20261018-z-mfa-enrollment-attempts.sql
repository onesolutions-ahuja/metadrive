ALTER TABLE md_user_totp ADD COLUMN IF NOT EXISTS enrollment_attempts integer NOT NULL DEFAULT 0 CHECK(enrollment_attempts BETWEEN 0 AND 5);
