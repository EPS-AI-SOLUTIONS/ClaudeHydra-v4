/**
 * useMemoryPruning — TanStack Query hooks for the Memory Pruning API.
 *
 * Provides reactive data fetching for pruning stats, history, config, and cycle details.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const API_BASE = '/api/memory/prune';
// ── Fetchers ─────────────────────────────────────────────────────────────────
async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  return resp.json();
}
// ── Hooks ────────────────────────────────────────────────────────────────────
/** Pruning metrics + running status — polls every 10s */
export function usePruningStats() {
  return useQuery({
    queryKey: ['memory-pruning', 'stats'],
    queryFn: () => fetchJson(`${API_BASE}/stats`),
    refetchInterval: 10_000,
    retry: 1,
  });
}
/** Pruning cycle history */
export function usePruningHistory(limit = 20) {
  return useQuery({
    queryKey: ['memory-pruning', 'history', limit],
    queryFn: () => fetchJson(`${API_BASE}/history?limit=${limit}`),
    refetchInterval: 30_000,
  });
}
/** Detailed log entries for a specific pruning cycle */
export function usePruningDetails(cycleId) {
  return useQuery({
    queryKey: ['memory-pruning', 'details', cycleId],
    queryFn: () => fetchJson(`${API_BASE}/details/${cycleId}`),
    enabled: !!cycleId,
  });
}
/** Current pruning configuration */
export function usePruningConfig() {
  return useQuery({
    queryKey: ['memory-pruning', 'config'],
    queryFn: () => fetchJson(`${API_BASE}/config`),
  });
}
/** Update pruning configuration */
export function useUpdatePruningConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config) => {
      const resp = await fetch(`${API_BASE}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory-pruning'] });
    },
  });
}
/** Trigger a manual pruning cycle */
export function useTriggerPrune() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const resp = await fetch(`${API_BASE}`, {
        method: 'POST',
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
    onSuccess: () => {
      // Refresh stats and history after triggering
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['memory-pruning'] });
      }, 1000);
    },
  });
}
