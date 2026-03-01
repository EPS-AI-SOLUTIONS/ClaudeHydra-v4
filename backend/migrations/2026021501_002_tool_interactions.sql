-- Tool interactions linked to chat messages.
-- Stores tool invocations made during agentic tool_use loops.

CREATE TABLE IF NOT EXISTS ch_tool_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES ch_messages(id) ON DELETE CASCADE,
    tool_use_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_input JSONB NOT NULL DEFAULT '{}'::jsonb,
    result TEXT,
    is_error BOOLEAN NOT NULL DEFAULT FALSE,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ch_ti_message ON ch_tool_interactions (message_id);
