/** Jaskier Shared Pattern */
// src/shared/api/client.ts
/**
 * ClaudeHydra — Typed API Client (thin shell)
 * =============================================
 * Initializes @jaskier/hydra-app API client with ClaudeHydra-specific config,
 * then re-exports all API functions. Single client instance shared between
 * app code and hydra-app components.
 */
import { initApiClient } from '@jaskier/hydra-app/shared/api';
import { env } from '../config/env';

// Initialize the shared API client — MUST happen before any component renders
initApiClient({
  flyUrl: 'https://claudehydra-v4-backend.fly.dev',
  localPort: 8082,
  authSecret: env.VITE_AUTH_SECRET,
});

// Re-export everything from hydra-app's client (single source of truth)
export {
  ApiError,
  apiDelete,
  apiGet,
  apiGetPolling,
  apiPatch,
  apiPost,
  apiPostFormData,
  BASE_URL,
  checkHealth,
  getBaseUrl,
} from '@jaskier/hydra-app/shared/api';
