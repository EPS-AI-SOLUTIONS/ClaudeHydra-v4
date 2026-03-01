-- A/B testing fields on global settings
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS ab_model_b TEXT DEFAULT NULL;
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS ab_split REAL DEFAULT NULL;
