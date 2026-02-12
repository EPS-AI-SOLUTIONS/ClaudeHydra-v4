# Changelog

All notable changes to ClaudeHydra are documented in this file.

---

## [4.0.0] -- 2026-02-12

### Complete Rewrite

ClaudeHydra v4 is a ground-up rebuild. The entire stack has been replaced to improve performance, simplify deployment, and eliminate external dependencies.

### Architecture Changes

| Area       | v3 (Regis Edition)         | v4 (Swarm Control Center)          |
|------------|----------------------------|------------------------------------|
| Frontend   | Next.js 15 (SSR/RSC)      | Vite 7 + React 19 (SPA)           |
| Backend    | Hono on Bun/Node           | Rust/Axum (standalone binary)      |
| State      | Redis                      | In-memory (`Arc<Mutex<AppState>>`) |
| Deployment | Vercel + Redis Cloud       | Standalone binary (self-hosted)    |
| Styling    | Tailwind 3 + CSS Modules   | Tailwind 4 + CSS variables         |
| Build      | Next.js bundler            | Vite 7 + TypeScript 5.9            |
| Package    | npm                        | pnpm                               |
| Linter     | ESLint + Prettier           | Biome 2.3                          |
| State Mgmt | React Context + useReducer | Zustand 5 + TanStack Query 5      |

### Added

- **Dual chat provider architecture** -- Claude (Anthropic API) and Ollama (local) in a single interface
- **Rust/Axum backend** -- zero-dependency standalone binary, port 8082
- **Zustand 5** -- lightweight global state management replacing React Context
- **TanStack Query 5** -- server state caching with automatic refetching
- **Glass-morphism design system** -- `.glass-panel`, `.glass-card`, `.glass-input`, `.glass-button`
- **CRT scan-line effect** -- animated horizontal line sweeping vertically
- **Grid background pattern** -- subtle 20px grid overlay
- **Dual theme system** -- Matrix Green (dark, `#00ff41`) and White Wolf (light, `#2d6a4f`)
- **Atomic component architecture** -- atoms, molecules, organisms, features
- **12 Witcher agents** -- three tiers (Commander, Coordinator, Executor) with themed roles
- **Session management** -- create, browse, and delete chat sessions
- **Message history** -- per-session message storage with model and agent metadata
- **System stats endpoint** -- real-time CPU and memory monitoring via `sysinfo`
- **i18next internationalization** -- language-ready with English default
- **Motion (Framer Motion) animations** -- slide, fade, and glow transitions
- **Markdown rendering** -- `react-markdown` with `remark-gfm` and `rehype-highlight`
- **Zod schema validation** -- runtime type safety for API responses
- **Model selector** -- dropdown to pick from available Ollama models
- **API key management** -- configure provider keys via settings UI or environment
- **Vitest test suite** -- 42 frontend unit tests
- **cargo test suite** -- 16 backend integration tests
- **Playwright scaffolding** -- E2E test configuration ready
- **Biome** -- unified linter and formatter replacing ESLint + Prettier
- **JetBrains Mono + Inter** -- dual font system (mono for data, sans for UI)

### Removed

- **Next.js** -- replaced by Vite SPA (no SSR needed for this use case)
- **Hono** -- replaced by Rust/Axum (native performance, single binary)
- **Redis** -- replaced by in-memory state (sessions do not need persistence across restarts)
- **Vercel deployment** -- replaced by standalone binary (no cloud lock-in)
- **ESLint + Prettier** -- replaced by Biome (single tool, faster)
- **CSS Modules** -- replaced by Tailwind 4 utility classes + CSS custom properties
- **npm** -- replaced by pnpm (faster, stricter dependency management)

### Migration Notes

- There is no migration path from v3 to v4. This is a clean-slate rewrite.
- Redis data from v3 cannot be imported (sessions are now ephemeral).
- Vercel environment variables must be moved to `.env` file or host environment.
- Next.js API routes (`/api/...`) are replaced by Rust handlers on the same paths.
- The frontend now runs on port **5177** (was 3000 in Next.js).
- The backend now runs on port **8082** (was dynamic in Hono).

---

## [3.x] -- Regis Edition

Previous version built on Next.js 15, Hono, and Redis. See the v3 branch for historical documentation.
