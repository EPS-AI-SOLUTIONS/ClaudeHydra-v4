-- Global prompt history — persists across sessions, survives restarts
CREATE TABLE IF NOT EXISTS ch_prompt_history (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ch_prompt_history_created ON ch_prompt_history(created_at DESC);
