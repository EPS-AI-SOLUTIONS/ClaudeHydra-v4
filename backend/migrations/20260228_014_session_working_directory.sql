-- Per-session working directory (overrides global setting per session)
-- Empty string = inherit from ch_settings.working_directory
ALTER TABLE ch_sessions ADD COLUMN IF NOT EXISTS working_directory TEXT NOT NULL DEFAULT '';
