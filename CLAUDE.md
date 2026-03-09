# ClaudeHydra v4 — AI Swarm Control Center

## Quick Start
- `npm run dev` — port 5199
- `npx tsc --noEmit` — type check

## Architecture
- Pure Vite SPA — React 19 + Zustand 5
- Views: home, chat, agents, history, settings, logs
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
- Key modules: `handlers.rs` (system prompt + tool defs), `state.rs` (AppState + LogRingBuffer), `models.rs`, `logs.rs` (4 log endpoints — backend/audit/flyio/activity), `tools/` (mod.rs + fs_tools.rs + pdf_tools.rs + zip_tools.rs + image_tools.rs + git_tools.rs + github_tools.rs + vercel_tools.rs + fly_tools.rs), `model_registry.rs` (dynamic model discovery), `browser_proxy.rs` (proxy status + health check + login/logout handlers), `watchdog.rs` (proxy auto-restart + health history), `oauth.rs` (Anthropic OAuth PKCE), `oauth_google.rs` (Google OAuth PKCE + API key), `oauth_github.rs` (GitHub OAuth), `oauth_vercel.rs` (Vercel OAuth), `service_tokens.rs` (Fly.io PAT), `mcp/` (client.rs + server.rs + config.rs)
- DB: `claudehydra` on localhost:5433 (user: claude, pass: claude_local)
- Tables: ch_settings, ch_sessions, ch_messages, ch_tool_interactions, ch_model_pins, ch_oauth_tokens, ch_google_auth, ch_oauth_github, ch_oauth_vercel, ch_service_tokens, ch_mcp_servers, ch_mcp_discovered_tools, ch_audit_log, ch_prompt_history

## Backend Local Dev
- Wymaga Docker Desktop (PostgreSQL container)
- Image: `postgres:17-alpine` (NO pgvector needed — ClaudeHydra doesn't use embeddings)
- Start: `docker compose up -d` (from `backend/`)
- Backend: `DATABASE_URL="postgresql://claude:claude_local@localhost:5433/claudehydra" cargo run --release`
- Env vars: `DATABASE_URL` (required), `ANTHROPIC_API_KEY` (required), `GOOGLE_API_KEY` (optional, for model_registry Google fetch), `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` (optional — enables Google OAuth button), `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` (optional), `VERCEL_CLIENT_ID` + `VERCEL_CLIENT_SECRET` (optional), `PORT` (default 8082)

## Fly.io Deploy
- App: `claudehydra-v4-backend` | Region: `arn` | VM: shared-cpu-1x 256MB
- Deploy: `cd backend && fly deploy`
- Dockerfile: multi-stage (rust builder → debian:trixie-slim runtime)
- DB: Fly Postgres `jaskier-db` → database `claudehydra_v4_backend` (NOT `claudehydra`!)
- Shared DB cluster `jaskier-db` hosts: geminihydra_v15_backend, claudehydra_v4_backend, tissaia_v4_backend
- Secrets: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `AUTH_SECRET` (set via `fly secrets set`)
- auto_stop_machines=stop, auto_start_machines=true, min_machines=0 (scales to zero)
- Connect to prod DB: `fly pg connect -a jaskier-db -d claudehydra_v4_backend`
- Logs: `fly logs --no-tail` or `fly logs`
- Health: `curl https://claudehydra-v4-backend.fly.dev/api/health`

## Migrations
- Folder: `backend/migrations/`
- SQLx sorts by filename prefix — each migration MUST have a unique date prefix
- Format: YYYYMMDDNN (unique 10-digit prefix — date + 2-digit sequence number within date)
- Current order: 2026021401_001 → 2026021501_002 → 2026021601_003 → 2026021701_004 → 2026022401_005 → 2026022402_006 → 2026022601_007 → 2026022801_009 → 2026022802_010 → 2026022803_011 → 2026022804_012 → 2026022805_013 → 2026022806_014 → 2026022807_015 → 2026030101_016
- All migrations MUST be idempotent (IF NOT EXISTS, ON CONFLICT DO NOTHING) — SQLx checks checksums
- All migration files MUST use LF line endings (not CRLF) — `.gitattributes` with `*.sql text eol=lf` enforces this
- Migration 005: model_pins table for pinning preferred models per role
- Migration 016: prompt_history table for input history persistence

## Migrations Gotchas (learned the hard way)
- **Checksum mismatch on deploy**: SQLx stores SHA-256 checksum per migration. If line endings change (CRLF→LF between Windows and Docker), checksum won't match → `VersionMismatch` panic. Fix: reset `_sqlx_migrations` table
- **Duplicate date prefixes**: Multiple files with same date cause `duplicate key` error. Fixed 2026-03-01: all files renamed from YYYYMMDD to YYYYMMDDNN format (10-digit unique prefix)
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

## OAuth / Authentication (Anthropic Claude MAX Plan)
- Backend module: `backend/src/oauth.rs` — Anthropic PKCE flow for Claude MAX Plan flat-rate API access
- State: `OAuthPkceState` in `state.rs` → `AppState.oauth_pkce: Arc<RwLock<Option<OAuthPkceState>>>`
- DB table: `ch_oauth_tokens` (singleton row with `id=1` CHECK constraint)
- Token auto-refresh: `get_valid_access_token()` refreshes expired tokens automatically
- API endpoints: `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/callback`, `POST /api/auth/logout`
- Frontend: `src/features/settings/components/OAuthSection.tsx` — 3-step PKCE flow (idle → waiting_code → exchanging)

## OAuth / Authentication (Google OAuth PKCE + API Key)
- Backend module: `backend/src/oauth_google.rs` — Google OAuth 2.0 redirect-based PKCE + API key management
- **Separate from Anthropic OAuth** — ClaudeHydra has dual OAuth (Anthropic for Claude API + Google for Gemini models)
- State: `AppState.google_oauth_pkce: Arc<RwLock<Option<OAuthPkceState>>>` (separate from `oauth_pkce`)
- DB table: `ch_google_auth` (singleton row, id=1 CHECK) — stores auth_method, access_token, refresh_token, api_key_encrypted, user_email
- `get_google_credential(state)` → credential resolution: DB OAuth token → DB API key → env var (`GOOGLE_API_KEY`/`GEMINI_API_KEY`)
- API endpoints: `GET /api/auth/google/status`, `POST /api/auth/google/login`, `GET /api/auth/google/redirect`, `POST /api/auth/google/logout`, `POST/DELETE /api/auth/google/apikey`
- Env vars: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (optional — OAuth button hidden if not set)
- Google Cloud Console: app "Jaskier", redirect URI: `http://localhost:8082/api/auth/google/redirect`
- Frontend: `GoogleOAuthSection.tsx` + `useGoogleAuthStatus.ts` in `src/features/settings/components/`

## OAuth — GitHub + Vercel + Fly.io
- `oauth_github.rs` — GitHub OAuth code exchange, DB table `ch_oauth_github`, endpoints `/api/auth/github/*`
- `oauth_vercel.rs` — Vercel OAuth code exchange, DB table `ch_oauth_vercel`, endpoints `/api/auth/vercel/*`
- `service_tokens.rs` — encrypted PAT storage (AES-256-GCM), DB table `ch_service_tokens`, endpoints `/api/tokens`

## Agent Tools (20+ tools, all tested & working)
- **Filesystem** (fs_tools.rs): `read_file`, `list_directory`, `write_file`, `search_in_files`
- **PDF/ZIP** (pdf_tools.rs, zip_tools.rs): `read_pdf`, `list_zip`, `extract_zip_file`
- **Image** (image_tools.rs): `analyze_image` (Claude Vision API, 5MB limit)
- **Web Scraping v2** (web_tools.rs, ~950 lines): `fetch_webpage` (SSRF protection, enhanced HTML→markdown, metadata/OpenGraph/JSON-LD, link categorization, retry+backoff, JSON output), `crawl_website` (robots.txt, sitemap, concurrent JoinSet, SHA-256 dedup, path prefix filter, exclude patterns)
- **Git** (git_tools.rs): `git_status`, `git_log`, `git_diff`, `git_branch`, `git_commit` (NO push)
- **GitHub** (github_tools.rs): `github_list_repos`, `github_get_repo`, `github_list_issues`, `github_get_issue`, `github_create_issue`, `github_create_pr`
- **Vercel** (vercel_tools.rs): `vercel_list_projects`, `vercel_deploy`, `vercel_get_deployment`
- **Fly.io** (fly_tools.rs): `fly_list_apps`, `fly_get_status`, `fly_get_logs` (read-only)
- **MCP proxy**: `mcp_{server}_{tool}` — routed via `state.mcp_client.call_tool()`

## "Co dalej?" — Follow-up Task Proposals
- System prompt rule in `build_system_prompt()` (`handlers.rs` ~L686): after every completed task, agent MUST add a `## Co dalej?` section with exactly 5 numbered follow-up tasks (specific, actionable, relevant)
- Works on both streaming (`/api/claude/chat/stream`) and non-streaming (`/api/claude/chat` via `resolve_chat_context()`)

## Dead Code Cleanup (2026-02-24)
- Removed 13 files, ~200 lines of unused code
- Deleted hooks: useAgents.ts, useChat.ts, useHealth.ts, useHistory.ts (features), useMarkdownWorker.ts (shared)
- Deleted worker: markdownWorker.ts
- Deleted 5 barrel index.ts files (features/home, agents, history, settings, chat)
- Deleted 2 empty .gitkeep files (chat/workers, shared/workers)
- Schema types made private: ProviderInfo, ClaudeModels (removed from exports in schemas.ts)

## Logs View (F21)
- Frontend: `src/features/logs/` — `LogsView.tsx` (4 tabs: Backend/Audit/Fly.io/Activity) + `useLogs.ts` (TanStack Query hooks, 5s polling)
- Backend: `logs.rs` — 4 endpoints (`/api/logs/backend`, `/api/logs/audit`, `/api/logs/flyio`, `/api/logs/activity`)
- `LogRingBuffer` in `state.rs` — in-memory ring buffer (capacity 1000) with `std::sync::Mutex`
- `LogBufferLayer` in `main.rs` — custom tracing Layer capturing events into ring buffer
- Fly.io logs: PAT from `service_tokens` (DB) with `FLY_API_TOKEN` env var fallback
- Sidebar: `ScrollText` icon, i18n keys `nav.logs`, `logs.*`
- View type: `| 'logs'` in `src/stores/viewStore.ts`

## Prompt History (Jaskier Shared Pattern — identical in GH)
- **Hook**: `usePromptHistory.ts` w `src/features/chat/hooks/` — eksportuje `{ promptHistory, addPrompt }`
- **Storage**: DB table `ch_prompt_history` (max 200 wpisów, auto-cleanup) + `localStorage` cache (`'prompt-history-cache'`)
- **Endpoints** (PROTECTED): `GET /api/prompt-history` (ASC, limit 500), `POST /api/prompt-history` (consecutive dedup + cap 200), `DELETE /api/prompt-history`
- **Backend**: `handlers.rs` linie 2360-2458
- **Migration**: `016_prompt_history.sql`
- **Arrow Up/Down w ChatInput.tsx** — bash-like nawigacja historii promptów:
  - **ArrowUp**: kursor na początku textarea LUB single-line → nawigacja wstecz (newest→oldest). Pierwszy press zapisuje draft do `savedDraftRef`
  - **ArrowDown**: kursor na końcu LUB single-line → nawigacja do przodu. Po ostatnim wpisie przywraca zapisany draft
  - **Draft preservation**: tekst użytkownika zachowany przy nawigacji, przywracany po wyjściu z historii
  - **Session change**: resetuje `historyIndex` do -1
- **Integracja**: `ClaudeChatView.tsx` → `usePromptHistory()` + `addPrompt()` w `handleSend()` → props `promptHistory` do `ChatInput`

## Workspace CLAUDE.md (canonical reference)
- Full Jaskier ecosystem docs: `C:\Users\BIURODOM\Desktop\ClaudeDesktop\CLAUDE.md`
- Covers: shared patterns, cross-project conventions, backend safety rules, OAuth details, MCP, working directory, fly.io infra
- This file is a project-scoped summary; workspace CLAUDE.md is the source of truth
- Last synced: 2026-03-09 (Browser proxy persistent context architecture)

## Browser Proxy (gemini-browser-proxy)
- **Watchdog**: `watchdog.rs` checks proxy health every 30s via `detailed_health_check()`, auto-restarts with exponential backoff (120s→240s→480s→900s max)
- **State**: `BrowserProxyStatus` in `state.rs` — `Arc<RwLock<BrowserProxyStatus>>` with ~18 fields (configured, reachable, ready, workers_ready/busy, pool_size, queue_length, consecutive_failures, backoff_level, total_restarts, last_pid)
- **Health history**: `ProxyHealthHistory` — ring buffer (50 events) tracking status transitions (unreachable→restart_initiated→online)
- **Endpoints**: `GET /api/browser-proxy/status`, `GET /api/browser-proxy/history`, `POST /api/browser-proxy/login`, `GET /api/browser-proxy/login/status`, `POST /api/browser-proxy/reinit`, `POST /api/browser-proxy/logout`
- **Env vars**: `BROWSER_PROXY_URL` (enables proxy), `BROWSER_PROXY_DIR` (path to proxy project for auto-restart)
- **Frontend**: `BrowserProxySection.tsx` (settings), `BrowserProxyBadge` in `StatusFooter.tsx` (green/red/yellow dot, pulse when busy)
- **Agent tool**: `generate_image` — sends image+prompt to proxy for Gemini browser-based generation

## Browser Proxy — Persistent Context Architecture
- **Context mode**: `launchPersistentContext` (NOT `storageState`) — `storageState` alone does NOT preserve Google sessions (cookies expired/invalidated server-side)
- **Login**: `npm run login:persistent` creates `browser-profile/` directory with full Chrome profile (cookies, localStorage, IndexedDB)
- **Workers**: share single persistent context — 4 pages within 1 browser process (not 4 separate contexts)
- **Profile backup**: `browser-profile/` copied to `worker-profile/` at init for crash recovery
- **Login detection**: positive signal — chat input textarea visible on AI Studio page (NOT absence of "Sign in" button, which is unreliable)
- **Session check**: Windows Task Scheduler `GeminiProxySessionCheck` runs every 6h to verify session validity
- **Why persistent context**: Google sets `httpOnly` + `secure` + `SameSite` cookies that `storageState` JSON export cannot fully capture; persistent context keeps the actual Chrome cookie DB intact
