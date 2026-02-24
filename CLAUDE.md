# ClaudeHydra v4 — AI Swarm Control Center

## Quick Start
- `npm run dev` — port 5199
- `npx tsc --noEmit` — type check

## Architecture
- Pure Vite SPA — React 19 + Zustand 5
- Views: home, chat, agents, history, settings
- ViewRouter in `src/main.tsx` with AnimatePresence transitions
- Sidebar: `src/components/organisms/Sidebar.tsx` (flat nav, session manager with rename/delete)

## Key Files
- `src/features/home/components/HomePage.tsx` — WelcomeScreen (ported from GeminiHydra)
- `src/shared/hooks/useViewTheme.ts` — full ViewTheme (replaced v3 simplified version)
- `src/stores/viewStore.ts` — ChatSession type, chatSessions, openTabs, activeSessionId
- `src/features/chat/components/OllamaChatView.tsx` — main chat interface

## Store API (differs from GeminiHydra)
- `setView(view)` not `setCurrentView(view)`
- `chatSessions` not `sessions`
- `activeSessionId` not `currentSessionId`
- `ChatSession` has `messageCount` field (GH uses `chatHistory[id].length`)

## Sidebar Session Manager
- `SessionItem` sub-component z rename (inline edit), delete (confirm), tooltip (preview)
- Sessions sorted by `updatedAt` descending
- Collapsed mode: only icon buttons for sessions

## Conventions
- motion/react for animations
- Biome for linting
- npm as package manager

## Backend (Rust/Axum)
- Port: 8082 | Prod: claudehydra-v4-backend.fly.dev
- Stack: Rust + Axum 0.8 + SQLx + PostgreSQL 17
- Route syntax: `{id}` (NOT `:id` — axum 0.8 breaking change)
- Entry point: `backend/src/lib.rs` → `create_router()` builds all API routes
- Key modules: `handlers.rs` (system prompt + tool defs), `state.rs` (AppState), `models.rs`, `tools.rs`, `model_registry.rs` (dynamic model discovery)
- DB: `claudehydra` on localhost:5433 (user: claude, pass: claude_local)
- Tables: ch_settings, ch_sessions, ch_messages, ch_tool_interactions, ch_model_pins

## Backend Local Dev
- Wymaga Docker Desktop (PostgreSQL container)
- Image: `postgres:17-alpine` (NO pgvector needed — ClaudeHydra doesn't use embeddings)
- Start: `docker compose up -d` (from `backend/`)
- Backend: `DATABASE_URL="postgresql://claude:claude_local@localhost:5433/claudehydra" cargo run --release`
- Env vars: `DATABASE_URL` (required), `ANTHROPIC_API_KEY` (required), `GOOGLE_API_KEY` (optional, for model_registry Google fetch), `PORT` (default 8082)

## Fly.io Deploy
- App: `claudehydra-v4-backend` | Region: `arn` | VM: shared-cpu-1x 256MB
- Deploy: `cd backend && fly deploy`
- Dockerfile: multi-stage (rust builder → debian:bookworm-slim runtime)
- DB: Fly Postgres `jaskier-db` → database `claudehydra_v4_backend` (NOT `claudehydra`!)
- Shared DB cluster `jaskier-db` hosts: geminihydra_v15_backend, claudehydra_v4_backend, tissaia_v4_backend
- Secrets: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` (set via `fly secrets set`)
- auto_stop_machines=stop, auto_start_machines=true, min_machines=0 (scales to zero)
- Connect to prod DB: `fly pg connect -a jaskier-db -d claudehydra_v4_backend`
- Logs: `fly logs --no-tail` or `fly logs`
- Health: `curl https://claudehydra-v4-backend.fly.dev/api/health`

## Migrations
- Folder: `backend/migrations/`
- SQLx sorts by filename prefix — each migration MUST have a unique date prefix
- Current order: 20260214_001 → 20260215_002 → 20260216_003 → 20260217_004 → 20260224_005
- All migrations MUST be idempotent (IF NOT EXISTS, ON CONFLICT DO NOTHING) — SQLx checks checksums
- All migration files MUST use LF line endings (not CRLF) — `.gitattributes` with `*.sql text eol=lf` enforces this
- Migration 005: model_pins table for pinning preferred models per role

## Migrations Gotchas (learned the hard way)
- **Checksum mismatch on deploy**: SQLx stores SHA-256 checksum per migration. If line endings change (CRLF→LF between Windows and Docker), checksum won't match → `VersionMismatch` panic. Fix: reset `_sqlx_migrations` table
- **Duplicate date prefixes**: Multiple files with same prefix cause `duplicate key` error on fresh DB init. Each file MUST have unique prefix (fixed 2026-02-24: 004 was 20260215 → 20260217)
- **pgvector not on fly.io**: Fly Postgres (`jaskier-db`) does NOT have pgvector. If future migrations need it, use `DO $$ ... EXCEPTION WHEN OTHERS` to skip gracefully
- **Reset prod DB migrations**: `fly pg connect -a jaskier-db -d claudehydra_v4_backend` then `DROP TABLE _sqlx_migrations CASCADE;` + drop all ch_* tables, then redeploy

## Dynamic Model Registry
- At startup `model_registry::startup_sync()` fetches all models from Anthropic + Google APIs
- Caches them in `AppState.model_cache` (TTL 1h, refreshed on demand via `/api/models/refresh`)
- Currently: 31 models cached (9 Anthropic + 22 Google)
- Auto-selects best model per tier using `version_key()` sort (highest version wins):
  - **commander**: latest `opus` (prefer non-dated, fallback to dated) → `claude-opus-4-6`
  - **coordinator**: latest `sonnet` (prefer non-dated, fallback to dated) → `claude-sonnet-4-6`
  - **executor**: latest `haiku` (prefer non-dated, fallback to dated) → `claude-haiku-4-5-20251001`
- Persists chosen coordinator model into `ch_settings.default_model` at startup
- No hardcoded model list — adapts automatically when Anthropic releases new models
- Pin override: `POST /api/models/pin` saves to `ch_model_pins` (priority 1, above auto-selection)
- API endpoints: `GET /api/models`, `POST /api/models/refresh`, `POST /api/models/pin`, `DELETE /api/models/pin/{use_case}`, `GET /api/models/pins`

## Agent Tools (all tested & working)
- `read_file` — reads local files by absolute path
- `write_file` — creates/overwrites local files (with automatic backup)
- `list_directory` — lists directory contents with depth
- `search_in_files` — regex pattern search in files

## Dead Code Cleanup (2026-02-24)
- Removed 13 files, ~200 lines of unused code
- Deleted hooks: useAgents.ts, useChat.ts, useHealth.ts, useHistory.ts (features), useMarkdownWorker.ts (shared)
- Deleted worker: markdownWorker.ts
- Deleted 5 barrel index.ts files (features/home, agents, history, settings, chat)
- Deleted 2 empty .gitkeep files (chat/workers, shared/workers)
- Schema types made private: ProviderInfo, ClaudeModels (removed from exports in schemas.ts)

## Knowledge Base (SQLite)
- Plik: `C:\Users\BIURODOM\Desktop\ClaudeDesktop\jaskier_knowledge.db`
- Zawiera kompletną wiedzę o 4 projektach
- Tabele: projects, dependencies, components, views, stores, hooks, theme_tokens, i18n_keys, api_endpoints, scripts, public_assets, shared_patterns, store_api_diff, unique_features, source_files
- 535 rekordów, ostatni sync: 2026-02-24 17:38
- Query: `py -c "import sqlite3; c=sqlite3.connect(r'C:\Users\BIURODOM\Desktop\ClaudeDesktop\jaskier_knowledge.db'); [print(r) for r in c.execute('SELECT * FROM projects')]"`
