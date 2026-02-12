/**
 * Zod v4 schemas for all ClaudeHydra v4 backend API endpoints.
 * Each schema mirrors the Rust/Axum response shape exactly.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const healthSchema = z.object({
  status: z.string(),
  version: z.string(),
  uptime_seconds: z.number(),
  ollama_connected: z.boolean(),
  providers: z.array(z.string()),
});

export type Health = z.infer<typeof healthSchema>;

// ---------------------------------------------------------------------------
// System Stats
// ---------------------------------------------------------------------------

export const systemStatsSchema = z.object({
  cpu_usage: z.number(),
  memory_used: z.number(),
  memory_total: z.number(),
  uptime_seconds: z.number(),
  active_sessions: z.number(),
  total_messages: z.number(),
});

export type SystemStats = z.infer<typeof systemStatsSchema>;

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  specialization: z.string(),
  tier: z.string(),
  status: z.string(),
  description: z.string(),
});

export type Agent = z.infer<typeof agentSchema>;

export const agentsListSchema = z.array(agentSchema);

export type AgentsList = z.infer<typeof agentsListSchema>;

// ---------------------------------------------------------------------------
// Ollama Health
// ---------------------------------------------------------------------------

export const ollamaHealthSchema = z.object({
  status: z.string(),
  models_available: z.number(),
});

export type OllamaHealth = z.infer<typeof ollamaHealthSchema>;

// ---------------------------------------------------------------------------
// Ollama Models
// ---------------------------------------------------------------------------

export const ollamaModelSchema = z.object({
  name: z.string(),
  size: z.number(),
  modified_at: z.string(),
  digest: z.string(),
});

export type OllamaModel = z.infer<typeof ollamaModelSchema>;

export const ollamaModelsSchema = z.object({
  models: z.array(ollamaModelSchema),
});

export type OllamaModels = z.infer<typeof ollamaModelsSchema>;

// ---------------------------------------------------------------------------
// Ollama Chat
// ---------------------------------------------------------------------------

export const ollamaChatRequestSchema = z.object({
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.string(),
    }),
  ),
  temperature: z.number().optional(),
});

export type OllamaChatRequest = z.infer<typeof ollamaChatRequestSchema>;

export const ollamaChatResponseSchema = z.object({
  message: z.object({
    role: z.string(),
    content: z.string(),
  }),
  model: z.string(),
  total_duration: z.number(),
  eval_count: z.number(),
});

export type OllamaChatResponse = z.infer<typeof ollamaChatResponseSchema>;

// ---------------------------------------------------------------------------
// Claude Chat
// ---------------------------------------------------------------------------

export const usageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
});

export type Usage = z.infer<typeof usageSchema>;

export const claudeChatRequestSchema = z.object({
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.string(),
    }),
  ),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
  system: z.string().optional(),
});

export type ClaudeChatRequest = z.infer<typeof claudeChatRequestSchema>;

export const claudeChatResponseSchema = z.object({
  content: z.string(),
  model: z.string(),
  usage: usageSchema,
});

export type ClaudeChatResponse = z.infer<typeof claudeChatResponseSchema>;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settingsSchema = z.object({
  default_model: z.string(),
  temperature: z.number(),
  max_tokens: z.number(),
  language: z.string(),
  theme: z.string(),
  ollama_host: z.string(),
});

export type Settings = z.infer<typeof settingsSchema>;

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const messageSchema = z.object({
  role: z.string(),
  content: z.string(),
  model: z.string().optional(),
});

export type Message = z.infer<typeof messageSchema>;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const sessionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  message_count: z.number(),
  preview: z.string().optional(),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionsListSchema = z.array(sessionSummarySchema);

export type SessionsList = z.infer<typeof sessionsListSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  message_count: z.number(),
  messages: z.array(messageSchema),
});

export type Session = z.infer<typeof sessionSchema>;
