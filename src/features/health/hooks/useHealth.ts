/**
 * Health-related TanStack Query hooks.
 * Polls backend health, system stats, and Ollama connectivity.
 */

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import type { Health, OllamaHealth, SystemStats } from '@/shared/api/schemas';

/** GET /api/health — refetch every 30s */
export function useHealthQuery() {
  return useQuery<Health>({
    queryKey: ['health'],
    queryFn: () => apiGet<Health>('/api/health'),
    refetchInterval: 30_000,
  });
}

/** GET /api/system/stats — refetch every 10s */
export function useSystemStatsQuery() {
  return useQuery<SystemStats>({
    queryKey: ['system-stats'],
    queryFn: () => apiGet<SystemStats>('/api/system/stats'),
    refetchInterval: 10_000,
  });
}

/** GET /api/ollama/health */
export function useOllamaHealthQuery() {
  return useQuery<OllamaHealth>({
    queryKey: ['ollama-health'],
    queryFn: () => apiGet<OllamaHealth>('/api/ollama/health'),
  });
}
