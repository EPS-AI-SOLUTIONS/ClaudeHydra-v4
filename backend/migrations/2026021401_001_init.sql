-- ClaudeHydra v4 — initial schema
-- ch_settings (singleton)
CREATE TABLE ch_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    theme TEXT NOT NULL DEFAULT 'dark',
    language TEXT NOT NULL DEFAULT 'en',
    default_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
    auto_start BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO ch_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ch_sessions
CREATE TABLE ch_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ch_sess_updated ON ch_sessions (updated_at DESC);

-- ch_messages
CREATE TABLE ch_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES ch_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model TEXT,
    agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ch_msg_session ON ch_messages (session_id, created_at ASC);
