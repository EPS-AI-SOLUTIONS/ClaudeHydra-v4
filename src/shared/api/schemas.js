/**
 * Zod v4 schemas for all ClaudeHydra v4 backend API endpoints.
 * Each schema mirrors the Rust/Axum response shape exactly.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
const providerInfoSchema = z.object({
  name: z.string(),
  available: z.boolean(),
});
const healthSchema = z.object({
  status: z.string(),
  version: z.string(),
  uptime_seconds: z.number(),
  providers: z.array(providerInfoSchema),
});
// ---------------------------------------------------------------------------
// System Stats
// ---------------------------------------------------------------------------
const systemStatsSchema = z.object({
  cpu_usage: z.number(),
  memory_used_mb: z.number(),
  memory_total_mb: z.number(),
  uptime_seconds: z.number(),
  active_sessions: z.number(),
  total_messages: z.number(),
});
// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------
const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  specialization: z.string(),
  tier: z.string(),
  status: z.string(),
  description: z.string(),
  model: z.string().optional(),
});
export const agentsListSchema = z.array(agentSchema);
// ---------------------------------------------------------------------------
// Claude Models
// ---------------------------------------------------------------------------
const claudeModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  tier: z.string(),
  provider: z.string(),
  available: z.boolean(),
});
export const claudeModelsSchema = z.array(claudeModelSchema);
// ---------------------------------------------------------------------------
// Claude Chat
// ---------------------------------------------------------------------------
const usageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
});
export const claudeChatResponseSchema = z.object({
  content: z.string(),
  model: z.string(),
  usage: usageSchema,
});
// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const settingsSchema = z.object({
  default_model: z.string(),
  temperature: z.number(),
  max_tokens: z.number(),
  language: z.string(),
  theme: z.string(),
  welcome_message: z.string().optional().default(''),
  /** Working directory for filesystem tools (empty = absolute paths only) */
  working_directory: z.string().optional().default(''),
  /** Max tool-call iterations per agent request */
  max_iterations: z.number().optional().default(10),
  /** Custom instructions injected into system prompt */
  custom_instructions: z.string().optional().default(''),
  /** Auto-updater enabled */
  auto_updater: z.boolean().optional().default(true),
  /** Telemetry (error reporting) enabled */
  telemetry: z.boolean().optional().default(false),
  /** Message compaction threshold — compact after this many messages */
  compaction_threshold: z.number().optional().default(25),
  /** Message compaction keep — keep this many recent messages after compaction */
  compaction_keep: z.number().optional().default(15),
});
// ---------------------------------------------------------------------------
// OAuth Status
// ---------------------------------------------------------------------------
const oauthStatusSchema = z.object({
  authenticated: z.boolean(),
  expired: z.boolean().optional(),
  expires_at: z.number().optional(),
  scope: z.string().optional(),
});
const oauthLoginResponseSchema = z.object({
  auth_url: z.string(),
  state: z.string(),
});
const oauthCallbackResponseSchema = z.object({
  status: z.string(),
  authenticated: z.boolean(),
  expires_at: z.number(),
});
// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
const messageSchema = z.object({
  role: z.string(),
  content: z.string(),
  model: z.string().optional(),
});
// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
const sessionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  message_count: z.number(),
  preview: z.string().optional(),
  working_directory: z.string().optional(),
});
const sessionsListSchema = z.array(sessionSummarySchema);
const sessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  message_count: z.number(),
  messages: z.array(messageSchema),
});
// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------
const ocrPageSchema = z.object({
  page_number: z.number(),
  text: z.string(),
});
const ocrResponseSchema = z.object({
  text: z.string(),
  pages: z.array(ocrPageSchema),
  total_pages: z.number(),
  processing_time_ms: z.number(),
  provider: z.string(),
  output_format: z.string().default('text'),
});
// ---------------------------------------------------------------------------
// WebSocket Protocol
// ---------------------------------------------------------------------------
const wsStartSchema = z.object({
  type: z.literal('start'),
  id: z.string(),
  model: z.string(),
  files_loaded: z.array(z.string()).optional().default([]),
});
const wsTokenSchema = z.object({
  type: z.literal('token'),
  content: z.string(),
});
const wsCompleteSchema = z.object({
  type: z.literal('complete'),
  duration_ms: z.number(),
});
const wsErrorSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
  code: z.string().optional(),
});
const wsToolCallSchema = z.object({
  type: z.literal('tool_call'),
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
  iteration: z.number(),
});
const wsToolResultSchema = z.object({
  type: z.literal('tool_result'),
  name: z.string(),
  success: z.boolean(),
  summary: z.string(),
  iteration: z.number(),
});
const wsToolProgressSchema = z.object({
  type: z.literal('tool_progress'),
  iteration: z.number(),
  tools_completed: z.number(),
  tools_total: z.number(),
});
const wsIterationSchema = z.object({
  type: z.literal('iteration'),
  number: z.number(),
  max: z.number(),
});
const wsPongSchema = z.object({
  type: z.literal('pong'),
});
const wsHeartbeatSchema = z.object({
  type: z.literal('heartbeat'),
});
const wsFallbackSchema = z.object({
  type: z.literal('fallback'),
  from: z.string(),
  to: z.string(),
  reason: z.string(),
});
const wsViewHintSchema = z.object({
  type: z.literal('view_hint'),
  views: z.array(z.string()),
});
export const wsServerMessageSchema = z.discriminatedUnion('type', [
  wsStartSchema,
  wsTokenSchema,
  wsCompleteSchema,
  wsErrorSchema,
  wsToolCallSchema,
  wsToolResultSchema,
  wsToolProgressSchema,
  wsIterationSchema,
  wsPongSchema,
  wsHeartbeatSchema,
  wsFallbackSchema,
  wsViewHintSchema,
]);
