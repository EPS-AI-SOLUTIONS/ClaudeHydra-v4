-- Google OAuth PKCE + API Key auth for ClaudeHydra
-- Jaskier Shared Pattern — singleton row (id=1 CHECK constraint)

CREATE TABLE IF NOT EXISTS ch_google_auth (
    id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    auth_method TEXT NOT NULL DEFAULT '',
    access_token TEXT NOT NULL DEFAULT '',
    refresh_token TEXT NOT NULL DEFAULT '',
    expires_at  BIGINT NOT NULL DEFAULT 0,
    api_key_encrypted TEXT NOT NULL DEFAULT '',
    user_email  TEXT NOT NULL DEFAULT '',
    user_name   TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
