# API Reference

Base URL: `http://localhost:8082/api` (backend direct) or `http://localhost:5177/api` (via Vite proxy)

All endpoints accept and return JSON. Timestamps are ISO-8601 UTC.

---

## Health and System

### GET /api/health

Returns application health status, uptime, and provider availability.

**Response:**

```json
{
  "status": "ok",
  "version": "4.0.0",
  "app": "ClaudeHydra",
  "uptime_seconds": 3600,
  "ollama_connected": true,
  "providers": [
    { "name": "ollama", "available": true },
    { "name": "anthropic", "available": true },
    { "name": "google", "available": false }
  ]
}
```

```bash
curl http://localhost:8082/api/health
```

---

### GET /api/system/stats

Returns real-time CPU and memory usage of the host machine.

**Response:**

```json
{
  "cpu_usage_percent": 23.5,
  "memory_used_mb": 8192.0,
  "memory_total_mb": 16384.0,
  "platform": "windows"
}
```

```bash
curl http://localhost:8082/api/system/stats
```

---

## Agents

### GET /api/agents

Returns all 12 Witcher agents with their roles, tiers, and status.

**Response:**

```json
[
  {
    "id": "agent-001",
    "name": "Geralt",
    "role": "Security",
    "tier": "Commander",
    "status": "active",
    "description": "Master witcher and security specialist -- hunts vulnerabilities like monsters"
  }
]
```

```bash
curl http://localhost:8082/api/agents
```

---

## Ollama (Local AI)

### GET /api/ollama/health

Checks connectivity to the local Ollama instance.

**Response:**

```json
{
  "connected": true,
  "version": "0.5.4"
}
```

```bash
curl http://localhost:8082/api/ollama/health
```

---

### GET /api/ollama/models

Lists all models available in the local Ollama installation.

**Response:**

```json
{
  "models": [
    {
      "name": "llama3.1:latest",
      "size": 4661224676,
      "modified_at": "2026-01-15T12:00:00Z"
    }
  ]
}
```

```bash
curl http://localhost:8082/api/ollama/models
```

---

### POST /api/ollama/chat

Send a chat completion request to Ollama. Non-streaming.

**Request Body:**

| Field         | Type             | Required | Default      | Description                  |
|---------------|------------------|----------|--------------|------------------------------|
| `messages`    | `ChatMessage[]`  | Yes      | --           | Conversation history         |
| `model`       | `string`         | No       | `llama3.1`   | Ollama model name            |
| `temperature` | `number`         | No       | --           | Sampling temperature (0-2)   |

```json
{
  "messages": [
    { "role": "user", "content": "Explain monads in one sentence." }
  ],
  "model": "llama3.1"
}
```

**Response:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "message": {
    "role": "assistant",
    "content": "A monad is a design pattern...",
    "model": "llama3.1:latest",
    "timestamp": "2026-02-12T10:30:00Z"
  },
  "model": "llama3.1:latest",
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 85,
    "total_tokens": 97
  }
}
```

```bash
curl -X POST http://localhost:8082/api/ollama/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"model":"llama3.1"}'
```

---

## Claude (Anthropic Cloud AI)

### POST /api/claude/chat

Send a chat completion request to Claude via the Anthropic Messages API. Requires `ANTHROPIC_API_KEY` to be configured.

**Request Body:**

| Field         | Type             | Required | Default                   | Description              |
|---------------|------------------|----------|---------------------------|--------------------------|
| `messages`    | `ChatMessage[]`  | Yes      | --                        | Conversation history     |
| `model`       | `string`         | No       | `claude-sonnet-4-20250514`| Anthropic model ID       |
| `temperature` | `number`         | No       | --                        | Sampling temperature     |
| `max_tokens`  | `number`         | No       | `4096`                    | Max response tokens      |

```json
{
  "messages": [
    { "role": "user", "content": "What is the Witcher's code?" }
  ],
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 2048
}
```

**Response:** Same `ChatResponse` shape as the Ollama endpoint.

**Error (no API key):**

```json
{ "error": "ANTHROPIC_API_KEY not configured" }
```
Status: `400 Bad Request`

```bash
curl -X POST http://localhost:8082/api/claude/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello Claude"}]}'
```

---

## Settings

### GET /api/settings

Returns the current application settings.

**Response:**

```json
{
  "theme": "dark",
  "language": "en",
  "ollama_host": "http://127.0.0.1:11434",
  "default_model": "llama3.1",
  "auto_start": false
}
```

```bash
curl http://localhost:8082/api/settings
```

---

### POST /api/settings

Replace settings with the provided values.

**Request Body:**

```json
{
  "theme": "light",
  "language": "en",
  "ollama_host": "http://127.0.0.1:11434",
  "default_model": "mistral",
  "auto_start": true
}
```

**Response:** The updated settings object.

```bash
curl -X POST http://localhost:8082/api/settings \
  -H "Content-Type: application/json" \
  -d '{"theme":"dark","language":"en","ollama_host":"http://127.0.0.1:11434","default_model":"llama3.1","auto_start":false}'
```

---

### POST /api/settings/api-key

Store an API key for a provider. Keys are held in memory only.

**Request Body:**

```json
{
  "provider": "ANTHROPIC_API_KEY",
  "key": "sk-ant-api03-..."
}
```

**Response:**

```json
{ "status": "ok", "provider": "ANTHROPIC_API_KEY" }
```

```bash
curl -X POST http://localhost:8082/api/settings/api-key \
  -H "Content-Type: application/json" \
  -d '{"provider":"ANTHROPIC_API_KEY","key":"sk-ant-..."}'
```

---

## Sessions and History

### GET /api/sessions

List all chat sessions (summaries without message bodies).

**Response:**

```json
[
  {
    "id": "abc-123",
    "title": "Rust async patterns",
    "created_at": "2026-02-12T09:00:00Z",
    "message_count": 14
  }
]
```

```bash
curl http://localhost:8082/api/sessions
```

---

### POST /api/sessions

Create a new chat session.

**Request Body:**

```json
{ "title": "Witcher lore discussion" }
```

**Response (201 Created):**

```json
{
  "id": "generated-uuid",
  "title": "Witcher lore discussion",
  "created_at": "2026-02-12T10:00:00Z",
  "messages": []
}
```

```bash
curl -X POST http://localhost:8082/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title":"New Session"}'
```

---

### GET /api/sessions/{id}

Retrieve a session with all its messages.

**Response:**

```json
{
  "id": "abc-123",
  "title": "Rust async patterns",
  "created_at": "2026-02-12T09:00:00Z",
  "messages": [
    {
      "id": "msg-001",
      "role": "user",
      "content": "Explain tokio select!",
      "model": null,
      "agent": null,
      "timestamp": "2026-02-12T09:01:00Z"
    }
  ]
}
```

```bash
curl http://localhost:8082/api/sessions/abc-123
```

**Error:** `404 Not Found` if the session does not exist.

---

### DELETE /api/sessions/{id}

Delete a session and all its messages.

**Response:**

```json
{ "status": "deleted", "id": "abc-123" }
```

```bash
curl -X DELETE http://localhost:8082/api/sessions/abc-123
```

**Error:** `404 Not Found` if the session does not exist.

---

### POST /api/sessions/{id}/messages

Append a message to an existing session.

**Request Body:**

| Field     | Type     | Required | Description                    |
|-----------|----------|----------|--------------------------------|
| `role`    | `string` | Yes      | `user` or `assistant`          |
| `content` | `string` | Yes      | Message text                   |
| `model`   | `string` | No       | Model that generated the reply |
| `agent`   | `string` | No       | Agent name (if applicable)     |

```json
{
  "role": "assistant",
  "content": "The select! macro allows...",
  "model": "llama3.1:latest"
}
```

**Response (201 Created):**

```json
{
  "id": "msg-002",
  "role": "assistant",
  "content": "The select! macro allows...",
  "model": "llama3.1:latest",
  "agent": null,
  "timestamp": "2026-02-12T09:01:30Z"
}
```

```bash
curl -X POST http://localhost:8082/api/sessions/abc-123/messages \
  -H "Content-Type: application/json" \
  -d '{"role":"user","content":"Thanks!"}'
```

**Error:** `404 Not Found` if the session does not exist.

---

## Common Types

### ChatMessage

```typescript
interface ChatMessage {
  role: string;      // "user" | "assistant" | "system"
  content: string;
  model?: string;    // present on assistant messages
  timestamp?: string; // ISO-8601
}
```

### ChatRequest

```typescript
interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;   // reserved for future use
}
```

### ChatResponse

```typescript
interface ChatResponse {
  id: string;
  message: ChatMessage;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

---

## Error Handling

| Status | Meaning                                  |
|--------|------------------------------------------|
| `400`  | Bad request (e.g., missing API key)      |
| `404`  | Session not found                        |
| `502`  | Upstream provider unreachable or errored |

Error responses include a JSON body:

```json
{ "error": "description of what went wrong" }
```

## Rate Limits

- Request body size limit: **10 MB** (enforced by tower-http)
- Provider timeouts: **120 seconds** for chat, **10 seconds** for model listing, **3 seconds** for health checks
