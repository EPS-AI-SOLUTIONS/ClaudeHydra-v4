# Component Library

ClaudeHydra follows Atomic Design methodology. Components are organized into four layers: Atoms, Molecules, Organisms, and Features.

All components live under `src/components/` (reusable) and `src/features/` (view-specific).

---

## Atoms (`src/components/atoms/`)

Smallest building blocks. No business logic. Styled with Tailwind + CSS variables.

### Button

```tsx
<Button variant="primary" size="md" onClick={handleClick}>
  Save Settings
</Button>
```

| Prop      | Type                                        | Default     |
|-----------|---------------------------------------------|-------------|
| `variant` | `"primary" \| "secondary" \| "ghost" \| "danger"` | `"primary"` |
| `size`    | `"sm" \| "md" \| "lg"`                      | `"md"`      |
| `onClick` | `() => void`                                | --          |
| `disabled`| `boolean`                                   | `false`     |

Uses `class-variance-authority` (CVA) for variant styling with `clsx` and `tailwind-merge`.

---

### Card

Glass-morphism container panel.

```tsx
<Card interactive hover>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
</Card>
```

| Prop          | Type      | Default |
|---------------|-----------|---------|
| `interactive` | `boolean` | `false` |
| `hover`       | `boolean` | `false` |
| `className`   | `string`  | --      |

Applies `.glass-panel` or `.card` base class depending on theme.

---

### Badge

Status labels and tags.

```tsx
<Badge variant="success">Online</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="error">Offline</Badge>
```

| Prop      | Type                                                  | Default     |
|-----------|-------------------------------------------------------|-------------|
| `variant` | `"default" \| "accent" \| "success" \| "warning" \| "error"` | `"default"` |

---

### Input

Themed text input with glass styling.

```tsx
<Input
  placeholder="Search agents..."
  value={query}
  onChange={setQuery}
/>
```

| Prop          | Type                       | Default |
|---------------|----------------------------|---------|
| `placeholder` | `string`                   | --      |
| `value`       | `string`                   | --      |
| `onChange`     | `(value: string) => void`  | --      |
| `type`        | `string`                   | `"text"`|
| `disabled`    | `boolean`                  | `false` |

---

### ProgressBar

Horizontal bar for CPU/memory/progress display.

```tsx
<ProgressBar value={65} max={100} />
```

| Prop    | Type     | Default |
|---------|----------|---------|
| `value` | `number` | `0`     |
| `max`   | `number` | `100`   |
| `label` | `string` | --      |

Uses gradient fill from `--matrix-accent-dim` to `--matrix-accent`.

---

### Skeleton

Loading placeholder with shimmer animation.

```tsx
<Skeleton width="100%" height="1rem" />
```

| Prop     | Type     | Default  |
|----------|----------|----------|
| `width`  | `string` | `"100%"` |
| `height` | `string` | `"1rem"` |
| `round`  | `boolean`| `false`  |

---

### GridBackground

Subtle CSS grid pattern overlay for backgrounds.

```tsx
<GridBackground />
```

Renders a full-viewport grid using `bg-grid-pattern` CSS class. Adapts to light/dark theme automatically.

---

### ScanLine

CRT monitor scan-line effect. Renders a horizontal glowing line that sweeps vertically.

```tsx
<ScanLine />
```

4-second vertical animation loop. Disabled automatically when `prefers-reduced-motion` is active.

---

## Molecules (`src/components/molecules/`)

Composed from atoms. Single-purpose, reusable across features.

### CodeBlock

Syntax-highlighted code with copy button.

```tsx
<CodeBlock language="rust" code={sourceCode} />
```

| Prop       | Type     | Default  |
|------------|----------|----------|
| `language` | `string` | `"text"` |
| `code`     | `string` | --       |

Uses `rehype-highlight` for syntax coloring within markdown.

---

### ModelSelector

Dropdown to pick an AI model from available providers.

```tsx
<ModelSelector
  models={availableModels}
  selected={currentModel}
  onSelect={setModel}
/>
```

| Prop       | Type                        | Default |
|------------|-----------------------------|---------|
| `models`   | `OllamaModel[]`             | --      |
| `selected` | `string`                    | --      |
| `onSelect` | `(model: string) => void`   | --      |

---

### StatusIndicator

Colored dot with label showing online/offline/pending state.

```tsx
<StatusIndicator status="online" label="Ollama" />
```

| Prop     | Type                                      | Default |
|----------|-------------------------------------------|---------|
| `status` | `"online" \| "offline" \| "pending"`      | --      |
| `label`  | `string`                                  | --      |

Uses `.status-dot-*` CSS classes with pulse animation.

---

### ViewSkeleton

Full-page loading skeleton for feature views. Displays while data is being fetched.

```tsx
<ViewSkeleton />
```

Composes multiple `Skeleton` atoms in a layout that matches the typical view structure.

---

### DataSkeleton

Table/list loading skeleton for data-heavy sections.

```tsx
<DataSkeleton rows={5} />
```

| Prop   | Type     | Default |
|--------|----------|---------|
| `rows` | `number` | `3`     |

---

## Organisms (`src/components/organisms/`)

Complex layout components. May connect to stores.

### AppShell

Root layout wrapper. Contains Sidebar, header, and content area.

```tsx
<AppShell>
  <ActiveView />
</AppShell>
```

- Manages the sidebar collapsed/expanded state
- Renders the header with system status
- Provides the main content container with scroll management

---

### Sidebar

Navigation sidebar with view switching.

```tsx
<Sidebar />
```

Navigation items:
- Home (dashboard)
- Chat (dual provider)
- Agents (Witcher roster)
- History (session browser)
- Settings (configuration)

Uses Zustand `viewStore` for active view tracking. Applies `.nav-item.active` class for the current route.

Supports collapsed mode (icon-only) for more content space.

---

### ErrorBoundary

React error boundary with themed fallback UI.

```tsx
<ErrorBoundary fallback={<ErrorFallback />}>
  <FeatureView />
</ErrorBoundary>
```

Catches rendering errors and displays a recovery interface styled in the Matrix theme.

---

## Features (`src/features/`)

Self-contained view modules. Each feature has its own `api/`, `components/`, `hooks/`, and `stores/` subdirectories.

### HomePage (`src/features/home/`)

Dashboard landing page.

- System health status (CPU, memory, uptime)
- Provider connectivity indicators (Ollama, Anthropic)
- Agent roster overview
- Quick-action cards

---

### OllamaChatView (`src/features/chat/`)

Dual-provider chat interface.

**Sub-components:**

#### ChatInput

Message input area with model selector and send button.

```tsx
<ChatInput
  onSend={handleSend}
  isLoading={isPending}
/>
```

| Prop        | Type                          | Default |
|-------------|-------------------------------|---------|
| `onSend`    | `(message: string) => void`   | --      |
| `isLoading` | `boolean`                     | `false` |

Supports Enter to send, Shift+Enter for newline.

#### MessageBubble

Individual chat message with markdown rendering.

```tsx
<MessageBubble message={msg} />
```

| Prop      | Type          | Default |
|-----------|---------------|---------|
| `message` | `ChatMessage` | --      |

- User messages: right-aligned, accent border
- Assistant messages: left-aligned, glass panel, with model badge
- Renders markdown via `react-markdown` with `remark-gfm` and `rehype-highlight`

---

### AgentsView (`src/features/agents/`)

Displays the 12 Witcher agents in a grid.

- Agent cards with name, role, tier, status, and description
- Tier grouping (Commander / Coordinator / Executor)
- Status badges with animated indicators

---

### HistoryView (`src/features/history/`)

Browse and manage chat sessions.

- Session list with title, date, and message count
- Click to load full session transcript
- Delete session functionality
- Create new session

---

### SettingsView (`src/features/settings/`)

Application configuration panel.

- Theme toggle (dark Matrix / light White Wolf)
- Language selection (i18next)
- Ollama host URL configuration
- Default model selection
- API key management (Anthropic, Google)
- Auto-start toggle

---

## Component Index

| Layer     | Component        | Path                                    |
|-----------|------------------|-----------------------------------------|
| Atom      | Button           | `src/components/atoms/Button.tsx`       |
| Atom      | Card             | `src/components/atoms/Card.tsx`         |
| Atom      | Badge            | `src/components/atoms/Badge.tsx`        |
| Atom      | Input            | `src/components/atoms/Input.tsx`        |
| Atom      | ProgressBar      | `src/components/atoms/ProgressBar.tsx`  |
| Atom      | Skeleton         | `src/components/atoms/Skeleton.tsx`     |
| Atom      | GridBackground   | `src/components/atoms/GridBackground.tsx`|
| Atom      | ScanLine         | `src/components/atoms/ScanLine.tsx`     |
| Molecule  | CodeBlock        | `src/components/molecules/CodeBlock.tsx`|
| Molecule  | ModelSelector    | `src/components/molecules/ModelSelector.tsx`|
| Molecule  | StatusIndicator  | `src/components/molecules/StatusIndicator.tsx`|
| Molecule  | ViewSkeleton     | `src/components/molecules/ViewSkeleton.tsx`|
| Molecule  | DataSkeleton     | `src/components/molecules/DataSkeleton.tsx`|
| Organism  | AppShell         | `src/components/organisms/AppShell.tsx` |
| Organism  | Sidebar          | `src/components/organisms/Sidebar.tsx`  |
| Organism  | ErrorBoundary    | `src/components/organisms/ErrorBoundary.tsx`|
| Feature   | HomePage         | `src/features/home/`                    |
| Feature   | OllamaChatView   | `src/features/chat/`                    |
| Feature   | AgentsView       | `src/features/agents/`                  |
| Feature   | HistoryView      | `src/features/history/`                 |
| Feature   | SettingsView     | `src/features/settings/`               |
