/**
 * Settings TanStack Query hooks.
 * Fetches, updates app settings and manages API key storage.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { Settings } from '@/shared/api/schemas';

/** GET /api/settings */
export function useSettingsQuery() {
  return useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => apiGet<Settings>('/api/settings'),
  });
}

/** PATCH /api/settings */
export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; settings: Settings }, Error, Partial<Settings>>({
    mutationFn: (body) => apiPatch<{ success: boolean; settings: Settings }>('/api/settings', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

/** POST /api/keys */
export function useSetApiKeyMutation() {
  return useMutation<{ success: boolean }, Error, { provider: string; key: string }>({
    mutationFn: (body) => apiPost<{ success: boolean }>('/api/keys', body),
  });
}
