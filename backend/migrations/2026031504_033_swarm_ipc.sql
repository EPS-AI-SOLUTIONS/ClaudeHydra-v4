-- Migration 033: Swarm IPC — Cross-Agent Communication Protocol
-- Stores swarm orchestration tasks and their results

CREATE TABLE IF NOT EXISTS ch_swarm_tasks (
    id          TEXT PRIMARY KEY,
    pattern     TEXT NOT NULL DEFAULT 'parallel',
    source_peer TEXT NOT NULL,
    target_peers JSONB NOT NULL DEFAULT '[]'::jsonb,
    prompt      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    results     JSONB NOT NULL DEFAULT '[]'::jsonb,
    duration_ms BIGINT,
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ch_swarm_tasks_status ON ch_swarm_tasks (status);
CREATE INDEX IF NOT EXISTS idx_ch_swarm_tasks_created ON ch_swarm_tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ch_swarm_tasks_source ON ch_swarm_tasks (source_peer);
