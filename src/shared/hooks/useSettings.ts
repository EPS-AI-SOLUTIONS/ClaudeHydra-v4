/**
 * Settings TanStack Query hooks.
 * Fetches, updates app settings and manages API key storage.
 */

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import type { Settings } from '@/shared/api/schemas';

/** localStorage key for telemetry setting (read by ErrorBoundary class component) */
const TELEMETRY_LS_KEY = 'claude-hydra-telemetry';

/** Check if telemetry is enabled (safe for class components / non-hook contexts) */
export function isTelemetryEnabled(): boolean {
  try {
    return localStorage.getItem(TELEMETRY_LS_KEY) === 'true';
  } catch {
    return false;
  }
}

/** GET /api/settings */
export function useSettingsQuery() {
  return useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const settings = await apiGet<Settings>('/api/settings');
      // Sync telemetry flag to localStorage for non-hook consumers (ErrorBoundary)
      try {
        localStorage.setItem(TELEMETRY_LS_KEY, String(settings.telemetry ?? false));
      } catch {
        /* ignore */
      }
      return settings;
    },
  });
}
