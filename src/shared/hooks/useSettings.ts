/**
 * Settings TanStack Query hooks.
 * Fetches, updates app settings and manages API key storage.
 */

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import type { Settings } from '@/shared/api/schemas';

/** GET /api/settings */
export function useSettingsQuery() {
  return useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => apiGet<Settings>('/api/settings'),
  });
}

