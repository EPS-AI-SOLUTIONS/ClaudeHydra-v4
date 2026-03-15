-- Migration 038: Memory Pruning — Self-Reflection & Knowledge Graph cleanup
-- Tracks pruning actions and stores pruning configuration.

-- Pruning action log (tracks every prune/merge/keep decision)
CREATE TABLE IF NOT EXISTS ch_memory_pruning_log (
    id              BIGSERIAL PRIMARY KEY,
    cycle_id        TEXT NOT NULL,
    entity_name     TEXT NOT NULL,
    action          TEXT NOT NULL CHECK (action IN ('delete', 'merge', 'keep', 'archive')),
    reason          TEXT,
    similarity_score DOUBLE PRECISION,
    merged_into     TEXT,
    tokens_before   BIGINT NOT NULL DEFAULT 0,
    tokens_after    BIGINT NOT NULL DEFAULT 0,
    pruned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ch_memory_pruning_log_cycle
    ON ch_memory_pruning_log (cycle_id);
CREATE INDEX IF NOT EXISTS idx_ch_memory_pruning_log_pruned
    ON ch_memory_pruning_log (pruned_at DESC);
CREATE INDEX IF NOT EXISTS idx_ch_memory_pruning_log_action
    ON ch_memory_pruning_log (action);

-- Pruning configuration (singleton row via id=1 CHECK)
CREATE TABLE IF NOT EXISTS ch_memory_pruning_config (
    id                      INTEGER PRIMARY KEY CHECK (id = 1),
    enabled                 BOOLEAN NOT NULL DEFAULT FALSE,
    similarity_threshold    DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    min_age_hours           INTEGER NOT NULL DEFAULT 24,
    max_memory_entries      INTEGER NOT NULL DEFAULT 500,
    auto_prune_interval_secs INTEGER NOT NULL DEFAULT 3600,
    max_cluster_size        INTEGER NOT NULL DEFAULT 5,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default config
INSERT INTO ch_memory_pruning_config (id, enabled, similarity_threshold, min_age_hours, max_memory_entries, auto_prune_interval_secs, max_cluster_size)
VALUES (1, FALSE, 0.85, 24, 500, 3600, 5)
ON CONFLICT (id) DO NOTHING;

-- Pruning cycle summary (one row per completed cycle)
CREATE TABLE IF NOT EXISTS ch_memory_pruning_cycles (
    id              TEXT PRIMARY KEY,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    total_entries   INTEGER NOT NULL DEFAULT 0,
    deleted_count   INTEGER NOT NULL DEFAULT 0,
    merged_count    INTEGER NOT NULL DEFAULT 0,
    kept_count      INTEGER NOT NULL DEFAULT 0,
    clusters_found  INTEGER NOT NULL DEFAULT 0,
    tokens_saved    BIGINT NOT NULL DEFAULT 0,
    error           TEXT,
    triggered_by    TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_ch_memory_pruning_cycles_started
    ON ch_memory_pruning_cycles (started_at DESC);
