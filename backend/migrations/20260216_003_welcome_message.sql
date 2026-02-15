ALTER TABLE ch_settings ADD COLUMN IF NOT EXISTS welcome_message TEXT NOT NULL DEFAULT '';

UPDATE ch_settings SET welcome_message = '## 🐺 Witaj w ClaudeHydra v4 — AI Swarm Control Center!

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

Napisz coś, np. *"przeczytaj plik src/main.tsx"* lub *"wyszukaj TODO w projekcie"*!'
WHERE id = 1;
