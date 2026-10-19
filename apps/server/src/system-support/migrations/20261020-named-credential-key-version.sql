-- Track encryption-key identity separately from ciphertext.
-- Existing ciphertext retains the legacy key identity until explicitly re-encrypted.
ALTER TABLE md_named_credentials
  ADD COLUMN IF NOT EXISTS encryption_key_id text NOT NULL DEFAULT 'legacy';
