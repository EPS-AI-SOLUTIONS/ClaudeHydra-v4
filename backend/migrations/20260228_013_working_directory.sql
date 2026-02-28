-- Working directory setting for filesystem tools
-- Empty string = no working directory set (uses ALLOWED_FILE_DIRS env / Desktop fallback)
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS working_directory TEXT NOT NULL DEFAULT '';
