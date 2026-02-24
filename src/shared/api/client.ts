/**
 * API client — typed fetch wrapper for ClaudeHydra v4 backend.
 * Base URL points to the Rust/Axum server on port 8082.
 * Includes automatic retry with exponential backoff for network failures.
 */

const BASE_URL = import.meta.env.PROD ? 'https://claudehydra-v4-backend.fly.dev' : 'http://localhost:8082';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

/** Retry on network errors (TypeError = "Failed to fetch") with exponential backoff. */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (attempt < retries && err instanceof TypeError) {
        const delay = RETRY_BASE_MS * 2 ** attempt;
        console.warn(
          `[api] Network error on ${init.method ?? 'GET'} ${url}, retrying in ${String(delay)}ms (${String(attempt + 1)}/${String(retries)})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new TypeError('Failed to fetch after retries');
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;

  const res = await fetchWithRetry(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'Unknown error');
    throw new ApiError(res.status, body);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export interface HealthStatus {
  ready: boolean;
  uptime_seconds?: number;
}

/** Lightweight readiness check — no retries, short timeout. */
export async function checkHealth(): Promise<HealthStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${BASE_URL}/api/health/ready`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      return (await response.json()) as HealthStatus;
    }
    if (response.status === 503) {
      const body = (await response.json()) as HealthStatus;
      return { ready: false, uptime_seconds: body.uptime_seconds };
    }
    return { ready: false };
  } catch {
    return { ready: false };
  }
}
