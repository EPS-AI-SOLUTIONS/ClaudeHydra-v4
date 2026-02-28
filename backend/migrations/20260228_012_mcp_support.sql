-- MCP (Model Context Protocol) support -- client + server
-- Jaskier Shared Pattern -- mcp

CREATE TABLE IF NOT EXISTS ch_mcp_servers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name TEXT NOT NULL UNIQUE,
    transport TEXT NOT NULL CHECK (transport IN ('stdio', 'http')),
    command TEXT,
    args TEXT NOT NULL DEFAULT '[]',
    env_vars TEXT NOT NULL DEFAULT '{}',
    url TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    auth_token TEXT,
    timeout_secs INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ch_mcp_discovered_tools (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    server_id TEXT NOT NULL REFERENCES ch_mcp_servers(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    description TEXT,
    input_schema TEXT NOT NULL DEFAULT '{}',
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(server_id, tool_name)
);
