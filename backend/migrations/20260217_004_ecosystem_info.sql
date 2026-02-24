-- ClaudeHydra v4 — ecosystem info in welcome message
-- Adds cross-project context so agents don't need to re-analyze every time
-- Idempotent: INSERT ... ON CONFLICT ensures this works on fresh and existing DBs

INSERT INTO ch_settings (id, welcome_message)
VALUES (1, '## 🐺 Witaj w ClaudeHydra v4 — AI Swarm Control Center!

Jestem agentem AI opartym na **Claude (Anthropic)**. Specjalizuję się w analizie kodu i zadaniach programistycznych.

### 🔧 Dostępne narzędzia
Mogę **wykonywać akcje** na Twoim systemie:
- **read_file** — odczyt plików z dysku
- **write_file** — tworzenie i nadpisywanie plików (z automatycznym backupem)
- **list_directory** — listowanie zawartości katalogów (z głębokością)
- **search_in_files** — wyszukiwanie wzorców regex w plikach

### 🗄️ Serwer SQL (PostgreSQL)
Backend połączony z bazą **PostgreSQL 17** (`claudehydra` na localhost:5433):
- `ch_settings` — konfiguracja aplikacji
- `ch_sessions` — sesje czatowe
- `ch_messages` — historia wiadomości (powiązana z sesjami)
- `ch_tool_interactions` — logi wywołań narzędzi

---

### 🌐 Ekosystem Jaskier — 3 Aplikacje

Należę do rodziny **Jaskier App Family**. Oto pełny kontekst ekosystemu:

#### 📦 Wspólny Stack (identyczny w 3 projektach)
React 19 + Vite 7 + TypeScript 5.9 + Zustand 5 + TailwindCSS 4 + motion/react + lucide-react + i18next (EN/PL) + sonner + @tanstack/react-query + zod + Biome (linter)

#### 🐺 GeminiHydra v15 — Multi-Agent AI Swarm
- **Port dev**: 5176 | **Backend**: 8081 (Rust/Axum) | **Prod**: geminihydra-v15-backend.fly.dev
- **Baza**: PostgreSQL 17 (`geminihydra`, port 5432)
- **Tabele**: gh_settings, gh_chat_messages, gh_memories, gh_knowledge_nodes/edges
- **Views**: home, chat, agents, history, settings, status
- **Store API**: `setCurrentView()`, `sessions`, `currentSessionId`, `chatHistory`, `tabs`
- **Chat**: WebSocket streaming (`/ws/execute`) + HTTP fallback (`/api/execute`)
- **Sidebar**: 64px collapsed / 240px expanded, logo + tekst "GeminiHydra" obok siebie
- **Persistence key**: `geminihydra-v15-state`

#### 🤖 ClaudeHydra v4 — AI Swarm Control Center (TO JESTEM JA)
- **Port dev**: 5199 | **Backend**: 8082 (Rust/Axum) | **Prod**: claudehydra-v4-backend.fly.dev
- **Baza**: PostgreSQL 17 (`claudehydra`, port 5433)
- **Tabele**: ch_settings, ch_sessions, ch_messages, ch_tool_interactions
- **Views**: home, chat, agents, history, settings
- **Store API**: `setView()` (NIE setCurrentView!), `chatSessions` (NIE sessions!), `activeSessionId` (NIE currentSessionId!), `openTabs: string[]`
- **Chat**: NDJSON streaming z agentic tool-use loop (read/write/list/search files)
- **Models**: Claude Opus 4.6, Sonnet 4.5, Haiku 4.5
- **12 agentów**: 3 tiers — Commander, Coordinator, Executor
- **Sidebar**: 64px collapsed / 240px expanded
- **Persistence key**: `claude-hydra-v4-view`

#### 🖼️ Tissaia v4 — AI Photo Restoration Studio
- **Port dev**: 5175 | **Backend**: 8080 (Rust/Axum) | **Prod**: tissaia-v4-backend.fly.dev
- **Baza**: PostgreSQL 17 (`tissaia`, port 5434)
- **Tabele**: ti_settings, ti_history
- **Views**: home, upload, crop, restore, results, history, settings, health
- **Store API**: `setView()`, **BRAK sesji/tabów/chatHistory** — prosty routing
- **Dodatkowe stores**: uploadStore, cropStore, restoreStore, resultsStore, historyStore
- **Workflow**: upload → crop (AI detection) → restore (Gemini) → results (comparison)
- **Sidebar**: 80px collapsed (w-20) / 256px expanded (w-64) — INNE wymiary niż Hydry!
- **Persistence key**: `tissaia-theme` (tylko theme)

#### 🔄 Cross-Project Porting
- Przy portowaniu komponentów: zmień dane (tytuły, badges, CTA), zachowaj layout i animacje
- `useViewTheme.ts` — identyczny interfejs (40+ props) we wszystkich 3 projektach
- CSS vars: `--matrix-accent`, `--matrix-bg-primary` itd.
- Light mode accent: **emerald (#2d6a4f)**, dark mode: **white (#ffffff)**
- Logo: `/logolight.webp` + `/logodark.webp` w public/

Napisz coś, np. *"przeczytaj plik src/main.tsx"* lub *"wyszukaj TODO w projekcie"*!')
ON CONFLICT (id) DO UPDATE SET welcome_message = EXCLUDED.welcome_message;
