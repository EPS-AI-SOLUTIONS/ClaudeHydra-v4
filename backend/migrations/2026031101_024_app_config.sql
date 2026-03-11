-- App configuration: custom_instructions, auto_updater, telemetry
-- Mirrors Claude Desktop config shape into ch_settings singleton

ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS custom_instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS auto_updater BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS telemetry BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed default MCP servers (ai-swarm-notifier + filesystem) if not already registered
INSERT INTO ch_mcp_servers (id, name, transport, command, args, env_vars, url, enabled, auth_token, timeout_secs)
VALUES
  ('seed-notifier', 'ai-swarm-notifier', 'stdio',
   'node', '["C:\\Users\\BIURODOM\\Desktop\\JaskierWorkspace\\JaskierNotifierMCP\\index.js"]',
   '{"NODE_ENV":"production"}', NULL, TRUE, NULL, 30),
  ('seed-filesystem', 'filesystem', 'stdio',
   'npx', '["-y","@modelcontextprotocol/server-filesystem","C:\\Users\\BIURODOM\\Desktop\\JaskierWorkspace","C:\\Users\\BIURODOM\\Desktop\\ClaudeDesktop"]',
   '{}', NULL, TRUE, NULL, 30)
ON CONFLICT (name) DO NOTHING;
