-- Task 32: Swarm Sandbox Environment
-- Isolated code execution sessions + execution history

CREATE TABLE IF NOT EXISTS ch_sandbox_sessions (
    id TEXT PRIMARY KEY,
    container_id TEXT,
    language TEXT NOT NULL DEFAULT 'node',
    status TEXT NOT NULL DEFAULT 'creating',
    memory_mb INTEGER NOT NULL DEFAULT 128,
    cpu_shares INTEGER NOT NULL DEFAULT 256,
    timeout_secs INTEGER NOT NULL DEFAULT 30,
    no_network BOOLEAN NOT NULL DEFAULT TRUE,
    read_only BOOLEAN NOT NULL DEFAULT FALSE,
    execution_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_execution_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ch_sandbox_executions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    code TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'node',
    stdout TEXT NOT NULL DEFAULT '',
    stderr TEXT NOT NULL DEFAULT '',
    exit_code INTEGER,
    status TEXT NOT NULL DEFAULT 'success',
    duration_ms BIGINT NOT NULL DEFAULT 0,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ch_sandbox_sessions_status ON ch_sandbox_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ch_sandbox_sessions_created ON ch_sandbox_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ch_sandbox_executions_session ON ch_sandbox_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_ch_sandbox_executions_executed ON ch_sandbox_executions(executed_at DESC);
