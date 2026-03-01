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

export const healthSchema = z.object({
  status: z.string(),
  version: z.string(),
  uptime_seconds: z.number(),
  providers: z.array(providerInfoSchema),
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
  model: z.string().optional(),
});

export type Agent = z.infer<typeof agentSchema>;

export const agentsListSchema = z.array(agentSchema);

// ---------------------------------------------------------------------------
// Claude Models
// ---------------------------------------------------------------------------

export const claudeModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  tier: z.string(),
  provider: z.string(),
  available: z.boolean(),
});

export type ClaudeModel = z.infer<typeof claudeModelSchema>;

export const claudeModelsSchema = z.array(claudeModelSchema);

// ---------------------------------------------------------------------------
// Claude Chat
// ---------------------------------------------------------------------------

export const usageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
});

export type Usage = z.infer<typeof usageSchema>;

export const claudeChatResponseSchema = z.object({
  content: z.string(),
  model: z.string(),
  usage: usageSchema,
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settingsSchema = z.object({
  default_model: z.string(),
  temperature: z.number(),
  max_tokens: z.number(),
  language: z.string(),
  theme: z.string(),
  welcome_message: z.string().optional().default(''),
  /** Working directory for filesystem tools (empty = absolute paths only) */
  working_directory: z.string().optional().default(''),
});

export type Settings = z.infer<typeof settingsSchema>;

// ---------------------------------------------------------------------------
// OAuth Status
// ---------------------------------------------------------------------------

export const oauthStatusSchema = z.object({
  authenticated: z.boolean(),
  expired: z.boolean().optional(),
  expires_at: z.number().optional(),
  scope: z.string().optional(),
});

export type OAuthStatus = z.infer<typeof oauthStatusSchema>;

export const oauthLoginResponseSchema = z.object({
  auth_url: z.string(),
  state: z.string(),
});

export type OAuthLoginResponse = z.infer<typeof oauthLoginResponseSchema>;

export const oauthCallbackResponseSchema = z.object({
  status: z.string(),
  authenticated: z.boolean(),
  expires_at: z.number(),
});

export type OAuthCallbackResponse = z.infer<typeof oauthCallbackResponseSchema>;

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
  working_directory: z.string().optional(),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

const sessionsListSchema = z.array(sessionSummarySchema);

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

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

export const ocrPageSchema = z.object({
  page_number: z.number(),
  text: z.string(),
});

export type OcrPage = z.infer<typeof ocrPageSchema>;

export const ocrResponseSchema = z.object({
  text: z.string(),
  pages: z.array(ocrPageSchema),
  total_pages: z.number(),
  processing_time_ms: z.number(),
  provider: z.string(),
});

export type OcrResponse = z.infer<typeof ocrResponseSchema>;
