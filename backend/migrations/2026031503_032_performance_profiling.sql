-- Migration 032: Performance profiling — additional indexes + web vitals table
-- Part of Parallel Task 08: Performance Profiling & Query Optimization

-- ============================================================================
-- 1. Web Vitals collection table (stores aggregated frontend performance data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ch_web_vitals (
    id          BIGSERIAL PRIMARY KEY,
    metric_name VARCHAR(10) NOT NULL,   -- CLS, LCP, FCP, TTFB, INP
    value       DOUBLE PRECISION NOT NULL,
    rating      VARCHAR(10) NOT NULL,   -- good, needs-improvement, poor
    delta       DOUBLE PRECISION DEFAULT 0,
    nav_type    VARCHAR(30) DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ch_vitals_metric_created
    ON ch_web_vitals (metric_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ch_vitals_created
    ON ch_web_vitals (created_at DESC);

-- ============================================================================
-- 2. Additional composite indexes for query performance (N+1 fix support)
-- ============================================================================

-- Composite index for message count aggregation (used by list_sessions LEFT JOIN)
CREATE INDEX IF NOT EXISTS idx_ch_messages_session_count
    ON ch_messages (session_id);

-- Composite index for role-filtered message queries
CREATE INDEX IF NOT EXISTS idx_ch_messages_session_role
    ON ch_messages (session_id, role);

-- Settings singleton lookup optimization (id=1 always)
CREATE INDEX IF NOT EXISTS idx_ch_settings_id
    ON ch_settings (id) WHERE id = 1;

-- Prompt history dedup check (last entry lookup)
CREATE INDEX IF NOT EXISTS idx_ch_prompt_history_last
    ON ch_prompt_history (created_at DESC) INCLUDE (content);

-- Agent usage analytics: model-based queries
CREATE INDEX IF NOT EXISTS idx_ch_messages_model_created
    ON ch_messages (model, created_at DESC)
    WHERE model IS NOT NULL;

-- ============================================================================
-- 3. Auto-cleanup: keep only last 30 days of web vitals data
-- ============================================================================

-- This is a suggested cleanup query to run periodically (not automatic):
-- DELETE FROM ch_web_vitals WHERE created_at < NOW() - INTERVAL '30 days';
