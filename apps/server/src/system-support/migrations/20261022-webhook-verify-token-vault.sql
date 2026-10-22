-- Preserve separately generated webhook verify tokens for audited, RBAC-restricted retrieval.
-- Older hash-only endpoints remain valid but require resetting the verification token to make it revealable.
ALTER TABLE md_inbound_webhook_endpoints ADD COLUMN IF NOT EXISTS verify_token_ciphertext bytea;
