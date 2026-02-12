# Testing

## Overview

| Layer    | Framework        | Tests | Config                  |
|----------|------------------|-------|-------------------------|
| Frontend | Vitest 4 + RTL   | 42    | `vitest.config.ts`      |
| E2E      | Playwright       | stubs | `playwright.config.ts`  |
| Backend  | cargo test       | 16    | `backend/Cargo.toml`    |

---

## Frontend Unit Tests (Vitest)

### Setup

Tests use Vitest with `jsdom` environment and React Testing Library.

```bash
# Run all tests
pnpm test

# Watch mode
pnpm vitest

# Run specific test file
pnpm vitest src/features/chat/
```

### Configuration

**`vitest.config.ts`** -- extends the Vite config with test-specific settings:

- Environment: `jsdom`
- Setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom` matchers)
- Path alias: `@` maps to `src/`

**`src/test/setup.ts`** -- global test setup:

```typescript
import '@testing-library/jest-dom';
```

### Test Structure

Tests live alongside their source files or in `__tests__` directories:

```
src/
  stores/
    __tests__/
      viewStore.test.ts    # Store unit tests
  features/
    chat/
      components/
        __tests__/
          ChatInput.test.tsx
          MessageBubble.test.tsx
    agents/
      components/
        __tests__/
          AgentsView.test.tsx
  components/
    atoms/
      __tests__/
        Button.test.tsx
        Badge.test.tsx
```

### Test Categories (42 tests)

| Category           | Count | Description                                   |
|--------------------|-------|-----------------------------------------------|
| Component rendering| 18    | Atoms, molecules render correctly             |
| Store logic        | 8     | Zustand store state transitions               |
| Hook behavior      | 6     | Custom hooks return expected values            |
| Feature views      | 6     | Feature components integrate correctly         |
| Utility functions  | 4     | Helpers, formatters, validators                |

### Writing Tests

Follow these conventions:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### Mocking

- **API calls**: Mock `fetch` or use MSW (Mock Service Worker) for integration tests
- **Zustand stores**: Import the store and call `setState` directly in tests
- **TanStack Query**: Wrap components in a `QueryClientProvider` with a fresh `QueryClient`

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      {ui}
    </QueryClientProvider>
  );
}
```

---

## E2E Tests (Playwright)

### Status: Stubs

End-to-end tests are scaffolded but not yet fully implemented. The configuration is in place.

**`playwright.config.ts`** configures:

- Base URL: `http://localhost:5177`
- Browser: Chromium
- Web server: starts `pnpm dev` automatically

### Running (when tests are added)

```bash
# Install browsers (first time)
npx playwright install

# Run E2E tests
npx playwright test

# Run with UI mode
npx playwright test --ui

# Run specific test
npx playwright test e2e/chat.spec.ts
```

### Test directory

```
e2e/
  # Stub test files will go here
  # Example: chat.spec.ts, agents.spec.ts, settings.spec.ts
```

### Planned E2E Scenarios

- [ ] Navigate between all views via sidebar
- [ ] Send a message in Ollama chat and receive a response
- [ ] Send a message in Claude chat and receive a response
- [ ] View agent roster and verify all 12 agents
- [ ] Create, view, and delete a session
- [ ] Toggle between dark and light themes
- [ ] Configure Ollama host in settings

---

## Backend Tests (cargo test)

### Running

```bash
cd backend
cargo test

# With output
cargo test -- --nocapture

# Run specific test
cargo test test_health_check
```

### Test Structure (16 tests)

Backend tests use Axum's `tower::ServiceExt` to send requests to the router without starting a network server:

```rust
use axum::http::StatusCode;
use http::Request;
use http_body_util::BodyExt;
use tower::ServiceExt;

use claudehydra_backend::create_router;
use claudehydra_backend::state::AppState;

#[tokio::test]
async fn test_health_check() {
    let state = Arc::new(Mutex::new(AppState::new()));
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}
```

### Test Categories

| Category           | Count | Description                              |
|--------------------|-------|------------------------------------------|
| Health endpoint    | 2     | Health check returns OK, provider status |
| System stats       | 1     | CPU/memory stats have valid values       |
| Agents             | 2     | Returns 12 agents, correct structure     |
| Settings           | 3     | Get, update, API key storage             |
| Sessions           | 5     | CRUD operations, message appending       |
| Error handling     | 3     | 404 on missing session, bad requests     |

### Integration Test Pattern

The `create_router()` function is extracted from `main()` specifically to enable testing without binding to a port. Tests construct the full app with real state and send HTTP requests through it.

---

## Coverage

### Frontend

```bash
pnpm vitest --coverage
```

Requires `@vitest/coverage-v8` (add as a dev dependency if not present).

### Backend

```bash
cargo install cargo-tarpaulin
cargo tarpaulin --out html
```

---

## CI Integration

Recommended CI steps:

```yaml
# Frontend
- pnpm install
- pnpm lint
- pnpm test
- pnpm build

# Backend
- cargo fmt -- --check
- cargo clippy -- -D warnings
- cargo test
- cargo build --release
```
