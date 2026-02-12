import { describe, it, expect } from 'vitest';
import {
  healthSchema,
  systemStatsSchema,
  agentSchema,
  agentsListSchema,
  ollamaHealthSchema,
  ollamaModelSchema,
  ollamaModelsSchema,
  ollamaChatResponseSchema,
  claudeChatResponseSchema,
  usageSchema,
  settingsSchema,
  messageSchema,
  sessionSummarySchema,
  sessionSchema,
} from '../schemas';

// ===========================================================================
// Health
// ===========================================================================
describe('healthSchema', () => {
  it('parses valid health response', () => {
    const data = {
      status: 'healthy',
      version: '4.0.1',
      uptime_seconds: 3600,
      ollama_connected: true,
      providers: ['ollama', 'claude'],
    };
    expect(healthSchema.parse(data)).toEqual(data);
  });

  it('rejects missing fields', () => {
    const result = healthSchema.safeParse({ status: 'ok' });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// System Stats
// ===========================================================================
describe('systemStatsSchema', () => {
  it('parses valid stats', () => {
    const data = {
      cpu_usage: 45.2,
      memory_used: 8192,
      memory_total: 16384,
      uptime_seconds: 7200,
      active_sessions: 3,
      total_messages: 150,
    };
    expect(systemStatsSchema.parse(data)).toEqual(data);
  });

  it('rejects non-number cpu_usage', () => {
    const result = systemStatsSchema.safeParse({
      cpu_usage: 'high',
      memory_used: 8192,
      memory_total: 16384,
      uptime_seconds: 7200,
      active_sessions: 3,
      total_messages: 150,
    });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Agent
// ===========================================================================
describe('agentSchema', () => {
  const validAgent = {
    id: 'agent-1',
    name: 'Researcher',
    role: 'research',
    specialization: 'web search',
    tier: 'premium',
    status: 'active',
    description: 'Researches topics on the web',
  };

  it('parses valid agent', () => {
    expect(agentSchema.parse(validAgent)).toEqual(validAgent);
  });

  it('rejects agent missing required fields', () => {
    const { description, ...incomplete } = validAgent;
    const result = agentSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});

describe('agentsListSchema', () => {
  it('parses array of agents', () => {
    const agents = [
      { id: '1', name: 'A', role: 'r', specialization: 's', tier: 't', status: 'active', description: 'd' },
      { id: '2', name: 'B', role: 'r', specialization: 's', tier: 't', status: 'idle', description: 'd' },
    ];
    expect(agentsListSchema.parse(agents)).toHaveLength(2);
  });
});

// ===========================================================================
// Ollama Health
// ===========================================================================
describe('ollamaHealthSchema', () => {
  it('parses valid ollama health', () => {
    const data = { status: 'connected', models_available: 5 };
    expect(ollamaHealthSchema.parse(data)).toEqual(data);
  });

  it('rejects missing models_available', () => {
    const result = ollamaHealthSchema.safeParse({ status: 'connected' });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Ollama Model
// ===========================================================================
describe('ollamaModelSchema', () => {
  const validModel = {
    name: 'llama3:8b',
    size: 4_700_000_000,
    modified_at: '2025-01-15T10:00:00Z',
    digest: 'sha256:abc123',
  };

  it('parses valid model', () => {
    expect(ollamaModelSchema.parse(validModel)).toEqual(validModel);
  });

  it('rejects model with missing digest', () => {
    const { digest, ...incomplete } = validModel;
    const result = ollamaModelSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});

describe('ollamaModelsSchema', () => {
  it('parses models wrapper with array', () => {
    const data = {
      models: [
        { name: 'llama3:8b', size: 4_700_000_000, modified_at: '2025-01-15T10:00:00Z', digest: 'abc' },
      ],
    };
    expect(ollamaModelsSchema.parse(data)).toEqual(data);
  });

  it('rejects when models is not an array', () => {
    const result = ollamaModelsSchema.safeParse({ models: 'not-array' });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Ollama Chat Response
// ===========================================================================
describe('ollamaChatResponseSchema', () => {
  it('parses valid response', () => {
    const data = {
      message: { role: 'assistant', content: 'Hello!' },
      model: 'llama3:8b',
      total_duration: 1234567890,
      eval_count: 42,
    };
    expect(ollamaChatResponseSchema.parse(data)).toEqual(data);
  });

  it('rejects response without message', () => {
    const result = ollamaChatResponseSchema.safeParse({
      model: 'llama3:8b',
      total_duration: 123,
      eval_count: 1,
    });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Claude Chat Response
// ===========================================================================
describe('claudeChatResponseSchema', () => {
  it('parses valid Claude response', () => {
    const data = {
      content: 'Hi there!',
      model: 'claude-sonnet-4-5-20250929',
      usage: { input_tokens: 10, output_tokens: 25 },
    };
    expect(claudeChatResponseSchema.parse(data)).toEqual(data);
  });

  it('rejects response with invalid usage shape', () => {
    const result = claudeChatResponseSchema.safeParse({
      content: 'Hi',
      model: 'claude-sonnet-4-5-20250929',
      usage: { input_tokens: 'ten' },
    });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Usage
// ===========================================================================
describe('usageSchema', () => {
  it('parses valid usage', () => {
    expect(usageSchema.parse({ input_tokens: 100, output_tokens: 200 }))
      .toEqual({ input_tokens: 100, output_tokens: 200 });
  });

  it('rejects missing output_tokens', () => {
    const result = usageSchema.safeParse({ input_tokens: 100 });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Settings
// ===========================================================================
describe('settingsSchema', () => {
  const validSettings = {
    default_model: 'claude-sonnet-4-5-20250929',
    temperature: 0.7,
    max_tokens: 4096,
    language: 'en',
    theme: 'matrix-green',
    ollama_host: 'http://localhost:11434',
  };

  it('parses valid settings', () => {
    expect(settingsSchema.parse(validSettings)).toEqual(validSettings);
  });

  it('rejects settings with missing theme', () => {
    const { theme, ...incomplete } = validSettings;
    const result = settingsSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Message
// ===========================================================================
describe('messageSchema', () => {
  it('parses message with optional model field', () => {
    const data = { role: 'user', content: 'Hello', model: 'gpt-4' };
    expect(messageSchema.parse(data)).toEqual(data);
  });

  it('parses message without optional model', () => {
    const data = { role: 'assistant', content: 'Hi!' };
    expect(messageSchema.parse(data)).toEqual(data);
  });

  it('rejects message missing content', () => {
    const result = messageSchema.safeParse({ role: 'user' });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Session Summary
// ===========================================================================
describe('sessionSummarySchema', () => {
  const validSummary = {
    id: 'sess-1',
    title: 'Test Session',
    created_at: '2025-06-01T12:00:00Z',
    updated_at: '2025-06-01T13:00:00Z',
    message_count: 10,
  };

  it('parses summary with optional preview', () => {
    const withPreview = { ...validSummary, preview: 'Hello world...' };
    expect(sessionSummarySchema.parse(withPreview)).toEqual(withPreview);
  });

  it('parses summary without preview', () => {
    expect(sessionSummarySchema.parse(validSummary)).toEqual(validSummary);
  });

  it('rejects summary missing id', () => {
    const { id, ...incomplete } = validSummary;
    const result = sessionSummarySchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Session (full)
// ===========================================================================
describe('sessionSchema', () => {
  it('parses full session with messages', () => {
    const data = {
      id: 'sess-1',
      title: 'Chat',
      created_at: '2025-06-01T12:00:00Z',
      updated_at: '2025-06-01T13:00:00Z',
      message_count: 2,
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
    };
    expect(sessionSchema.parse(data)).toEqual(data);
  });

  it('rejects session without messages array', () => {
    const result = sessionSchema.safeParse({
      id: 'sess-1',
      title: 'Chat',
      created_at: '2025-06-01T12:00:00Z',
      updated_at: '2025-06-01T13:00:00Z',
      message_count: 0,
    });
    expect(result.success).toBe(false);
  });
});
