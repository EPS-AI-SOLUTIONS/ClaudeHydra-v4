-- migration: performance indexes for analytics queries (N+1 fix follow-up)

-- Composite index speeds up analytics queries that filter by created_at and group by model/tier/agent_id.
CREATE INDEX IF NOT EXISTS idx_ch_agent_usage_created_agent
    ON ch_agent_usage (created_at DESC, agent_id);

CREATE INDEX IF NOT EXISTS idx_ch_agent_usage_created_model
    ON ch_agent_usage (created_at DESC, model);

-- Index on executed_at for the top-tools analytics query (WHERE executed_at >= NOW()-interval).
-- Partial index on tool_name for GROUP BY performance.
CREATE INDEX IF NOT EXISTS idx_ch_ti_executed_at
    ON ch_tool_interactions (executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ch_ti_tool_name
    ON ch_tool_interactions (tool_name);
