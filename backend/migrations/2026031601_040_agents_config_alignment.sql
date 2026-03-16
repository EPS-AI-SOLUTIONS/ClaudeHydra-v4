-- Add missing columns for BaseHydraState WitcherAgent loader compatibility
-- These columns exist on Quad Hydra agents tables (gh_agents, ds_agents, etc.)
-- but were never added to CH's ch_agents_config (created in 025).

-- Core agent fields expected by jaskier-core WitcherAgent struct
ALTER TABLE ch_agents_config ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT NULL;
ALTER TABLE ch_agents_config ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';

-- Per-agent override fields (NULL = use global settings)
ALTER TABLE ch_agents_config ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION DEFAULT NULL;
ALTER TABLE ch_agents_config ADD COLUMN IF NOT EXISTS model_override TEXT DEFAULT NULL;
ALTER TABLE ch_agents_config ADD COLUMN IF NOT EXISTS thinking_level TEXT DEFAULT NULL;

-- A/B testing fields
ALTER TABLE ch_agents_config ADD COLUMN IF NOT EXISTS model_b TEXT DEFAULT NULL;
ALTER TABLE ch_agents_config ADD COLUMN IF NOT EXISTS ab_split REAL DEFAULT NULL;

-- Seed keywords for existing agents (matching GH/DS/GK/OA patterns)
UPDATE ch_agents_config SET keywords = ARRAY['security', 'protect', 'auth', 'encrypt', 'threat', 'vulnerability'] WHERE id = 'agent-001'; -- Geralt
UPDATE ch_agents_config SET keywords = ARRAY['architecture', 'design', 'pattern', 'structure', 'refactor'] WHERE id = 'agent-002'; -- Yennefer
UPDATE ch_agents_config SET keywords = ARRAY['test', 'quality', 'assert', 'coverage', 'verify'] WHERE id = 'agent-003'; -- Vesemir
UPDATE ch_agents_config SET keywords = ARRAY['data', 'database', 'sql', 'query', 'analytics'] WHERE id = 'agent-004'; -- Triss
UPDATE ch_agents_config SET keywords = ARRAY['document', 'readme', 'comment', 'changelog'] WHERE id = 'agent-005'; -- Jaskier
UPDATE ch_agents_config SET keywords = ARRAY['performance', 'optimize', 'speed', 'cache', 'benchmark'] WHERE id = 'agent-006'; -- Ciri
UPDATE ch_agents_config SET keywords = ARRAY['strategy', 'plan', 'coordinate', 'prioritize'] WHERE id = 'agent-007'; -- Dijkstra
UPDATE ch_agents_config SET keywords = ARRAY['deploy', 'devops', 'ci', 'docker', 'infrastructure'] WHERE id = 'agent-008'; -- Lambert
UPDATE ch_agents_config SET keywords = ARRAY['backend', 'api', 'rust', 'server', 'endpoint'] WHERE id = 'agent-009'; -- Eskel
UPDATE ch_agents_config SET keywords = ARRAY['research', 'analyze', 'investigate', 'learn'] WHERE id = 'agent-010'; -- Regis
UPDATE ch_agents_config SET keywords = ARRAY['frontend', 'ui', 'react', 'css', 'component'] WHERE id = 'agent-011'; -- Zoltan
UPDATE ch_agents_config SET keywords = ARRAY['monitor', 'alert', 'log', 'metric', 'trace'] WHERE id = 'agent-012'; -- Philippa
