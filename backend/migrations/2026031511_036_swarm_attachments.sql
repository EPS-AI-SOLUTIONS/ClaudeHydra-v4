-- Migration 036: Add attachments to SwarmTask for multimodal features
ALTER TABLE ch_swarm_tasks ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
