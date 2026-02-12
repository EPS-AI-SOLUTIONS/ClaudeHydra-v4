# Deployment

## Build

### Frontend

```bash
pnpm install
pnpm build
```

Output: `dist/` directory containing static HTML, JS, and CSS assets.

The build pipeline runs TypeScript checking (`tsc -b`) followed by the Vite production build. Target: `esnext` with source maps enabled.

### Backend

```bash
cd backend
cargo build --release
```

Output: `target/release/claudehydra-backend` (or `claudehydra-backend.exe` on Windows).

The release binary is a standalone executable with no runtime dependencies beyond the OS.

---

## Environment Variables

| Variable           | Required | Default                      | Description                            |
|--------------------|----------|------------------------------|----------------------------------------|
| `ANTHROPIC_API_KEY`| No       | --                           | Anthropic API key for Claude provider  |
| `GOOGLE_API_KEY`   | No       | --                           | Google API key (reserved)              |
| `OLLAMA_HOST`      | No       | `http://127.0.0.1:11434`    | Ollama server URL                      |
| `PORT`             | No       | `8082`                       | Backend HTTP listen port               |
| `RUST_LOG`         | No       | `info`                       | Log level (tracing-subscriber filter)  |

The backend reads `.env` files via `dotenvy` at startup. Create a `.env` file in the `backend/` directory:

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
OLLAMA_HOST=http://127.0.0.1:11434
PORT=8082
RUST_LOG=info
```

API keys can also be set at runtime via `POST /api/settings/api-key` (stored in memory only, lost on restart).

---

## Running Standalone

After building both frontend and backend:

```bash
# Build frontend
pnpm build

# Build backend
cd backend && cargo build --release

# Copy frontend assets next to the binary (or serve from a reverse proxy)
# Start the backend
ANTHROPIC_API_KEY=sk-ant-... ./target/release/claudehydra-backend
```

In production, use a reverse proxy (nginx, Caddy) to serve the `dist/` static files and proxy `/api/*` to the backend, or embed static file serving in the Axum app.

### Nginx Example

```nginx
server {
    listen 80;
    server_name hydra.example.com;

    # Frontend static files
    location / {
        root /opt/claudehydra/dist;
        try_files $uri $uri/ /index.html;
    }

    # API proxy to Rust backend
    location /api/ {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }
}
```

---

## Docker

### Dockerfile (multi-stage)

```dockerfile
# ── Stage 1: Build frontend ─────────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ── Stage 2: Build backend ──────────────────────────────────
FROM rust:1.84-bookworm AS backend-build
WORKDIR /app/backend
COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/src ./src
RUN cargo build --release

# ── Stage 3: Runtime ────────────────────────────────────────
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend binary
COPY --from=backend-build /app/backend/target/release/claudehydra-backend .

# Copy frontend assets
COPY --from=frontend-build /app/dist ./dist

ENV PORT=8082
ENV RUST_LOG=info

EXPOSE 8082

CMD ["./claudehydra-backend"]
```

### Build and run

```bash
docker build -t claudehydra:4.0.0 .

docker run -d \
  --name claudehydra \
  -p 8082:8082 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e OLLAMA_HOST=http://host.docker.internal:11434 \
  claudehydra:4.0.0
```

Note: When Ollama runs on the host machine, use `host.docker.internal` (Docker Desktop) or `--network host` (Linux) to reach it from inside the container.

### Docker Compose

```yaml
version: "3.9"

services:
  claudehydra:
    build: .
    ports:
      - "8082:8082"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OLLAMA_HOST=http://ollama:11434
      - RUST_LOG=info
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

volumes:
  ollama_data:
```

```bash
# Start everything
docker compose up -d

# Pull a model into Ollama
docker compose exec ollama ollama pull llama3.1
```

---

## Health Checks

Use the health endpoint for monitoring and container orchestration:

```bash
curl -f http://localhost:8082/api/health || exit 1
```

Docker healthcheck:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8082/api/health || exit 1
```

---

## Production Checklist

- [ ] Set `ANTHROPIC_API_KEY` via environment variable or secrets manager
- [ ] Confirm Ollama is reachable from the backend host
- [ ] Set `RUST_LOG=warn` for production (reduce log verbosity)
- [ ] Place a reverse proxy (nginx/Caddy) in front for TLS termination
- [ ] Serve `dist/` via the reverse proxy with proper caching headers
- [ ] Set up monitoring on `/api/health` and `/api/system/stats`
- [ ] Configure request body size limits at the proxy level (backend enforces 10 MB)
- [ ] Back up API keys -- they are stored in memory only and do not survive restarts
