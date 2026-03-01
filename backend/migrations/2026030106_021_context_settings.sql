-- Context management upgrade: add temperature + max_tokens to ch_settings
-- Enables DB-backed generation parameters (previously request-only with hardcoded fallbacks)
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION NOT NULL DEFAULT 0.7;
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS max_tokens INTEGER NOT NULL DEFAULT 4096;
