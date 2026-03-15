-- Migration 034: Semantic Cache & Context Compression (Enterprise)
--
-- Tracks cache performance metrics in PostgreSQL for Grafana dashboards.
-- The actual cache entries live in Qdrant (vector DB, port 6333).
-- This table stores aggregated metrics and configuration.

-- ── Semantic Cache Config ─────────────────────────────────────────────────────
-- Runtime configuration persisted across restarts.
CREATE TABLE IF NOT EXISTS ch_semantic_cache_config (
    id            INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    ttl_seconds   INTEGER NOT NULL DEFAULT 86400,      -- 24h
    exact_hit_threshold   REAL NOT NULL DEFAULT 0.95,
    partial_hit_threshold REAL NOT NULL DEFAULT 0.85,
    max_entries   INTEGER NOT NULL DEFAULT 10000,
    qdrant_url    TEXT NOT NULL DEFAULT 'http://localhost:6333',
    collection_name TEXT NOT NULL DEFAULT 'semantic_cache',
    embedding_model TEXT NOT NULL DEFAULT 'gemini-embedding-2-preview',
    cost_per_million_input_tokens  REAL NOT NULL DEFAULT 3.0,
    cost_per_million_output_tokens REAL NOT NULL DEFAULT 15.0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default config (idempotent)
INSERT INTO ch_semantic_cache_config (id, enabled)
VALUES (1, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── Semantic Cache Metrics (time-series) ──────────────────────────────────────
-- Periodic snapshots of cache performance for Grafana dashboards.
-- Populated by a background task every 5 minutes.
CREATE TABLE IF NOT EXISTS ch_semantic_cache_metrics (
    id              BIGSERIAL PRIMARY KEY,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_queries   BIGINT NOT NULL DEFAULT 0,
    exact_hits      BIGINT NOT NULL DEFAULT 0,
    partial_hits    BIGINT NOT NULL DEFAULT 0,
    misses          BIGINT NOT NULL DEFAULT 0,
    hit_rate        REAL NOT NULL DEFAULT 0.0,
    tokens_saved    BIGINT NOT NULL DEFAULT 0,
    cost_saved_usd  REAL NOT NULL DEFAULT 0.0,
    avg_latency_ms  REAL NOT NULL DEFAULT 0.0,
    qdrant_points   BIGINT NOT NULL DEFAULT 0
);

-- Index for time-range queries (Grafana)
CREATE INDEX IF NOT EXISTS idx_ch_semantic_cache_metrics_time
    ON ch_semantic_cache_metrics (recorded_at DESC);

-- ── Compression Stats ─────────────────────────────────────────────────────────
-- Tracks AST compression results for reporting.
CREATE TABLE IF NOT EXISTS ch_compression_stats (
    id                BIGSERIAL PRIMARY KEY,
    compressed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    file_path         TEXT NOT NULL,
    language          TEXT NOT NULL,
    original_chars    INTEGER NOT NULL,
    compressed_chars  INTEGER NOT NULL,
    compression_ratio REAL NOT NULL,
    session_id        TEXT  -- optional: link to chat session
);

CREATE INDEX IF NOT EXISTS idx_ch_compression_stats_time
    ON ch_compression_stats (compressed_at DESC);
