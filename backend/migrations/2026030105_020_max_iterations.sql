-- Add max_iterations to ch_settings (agent tool-call loop limit)
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS max_iterations INTEGER NOT NULL DEFAULT 10;
