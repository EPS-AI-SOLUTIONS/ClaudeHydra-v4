// src/features/health/hooks/useHealth.ts
/**
 * ClaudeHydra v4 - Health Hooks
 * ==============================
 * TanStack Query hooks for health and system stats endpoints.
 * Mirrors GeminiHydra pattern using shared apiGet client.
 */
import { useQuery } from '@tanstack/react-query';
import { apiGetPolling } from '@/shared/api/client';
export function useHealthQuery() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiGetPolling('/api/health'),
    refetchInterval: 30_000,
    retry: false, // refetchInterval handles recovery naturally — no retry stacking
  });
}
export function useSystemStatsQuery(enabled = true) {
  return useQuery({
    queryKey: ['system', 'stats'],
    queryFn: () => apiGetPolling('/api/system/stats'),
    refetchInterval: 10_000,
    retry: false, // refetchInterval handles recovery
    enabled, // consumers pass healthStatus !== 'offline'
  });
}
export function useHealthStatus() {
  const { data, isError } = useHealthQuery();
  if (isError || !data) return 'offline';
  const s = data.status?.toLowerCase();
  if (s === 'ok' || s === 'healthy') return 'healthy';
  return 'degraded';
}
