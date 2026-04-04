/**
 * useSemanticCache — TanStack Query hooks for the Semantic Cache API.
 *
 * Provides reactive data fetching for cache stats, health, config, and entries.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const API_BASE = '/api/semantic-cache';
// ── Fetchers ─────────────────────────────────────────────────────────────────
async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  return resp.json();
}
// ── Hooks ────────────────────────────────────────────────────────────────────
/** Cache stats + collection info — polls every 10s */
export function useCacheStats() {
  return useQuery({
    queryKey: ['semantic-cache', 'stats'],
    queryFn: () => fetchJson(`${API_BASE}/stats`),
    refetchInterval: 10_000,
    retry: 1,
  });
}
/** Qdrant + embedding health check */
export function useCacheHealth() {
  return useQuery({
    queryKey: ['semantic-cache', 'health'],
    queryFn: () => fetchJson(`${API_BASE}/health`),
    refetchInterval: 30_000,
    retry: 1,
  });
}
/** Current configuration */
export function useCacheConfig() {
  return useQuery({
    queryKey: ['semantic-cache', 'config'],
    queryFn: () => fetchJson(`${API_BASE}/config`),
  });
}
/** Update cache configuration */
export function useUpdateConfig() {
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
      queryClient.invalidateQueries({ queryKey: ['semantic-cache'] });
    },
  });
}
/** List cached entries (paginated) */
export function useCacheEntries(limit = 20, offset) {
  return useQuery({
    queryKey: ['semantic-cache', 'entries', limit, offset],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (offset) params.set('offset', offset);
      return fetchJson(`${API_BASE}/entries?${params}`);
    },
  });
}
/** Delete a specific cache entry */
export function useDeleteEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const resp = await fetch(`${API_BASE}/entries/${id}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['semantic-cache'] });
    },
  });
}
/** Invalidate cache — by git commit or flush all */
export function useInvalidateCache() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params) => {
      const resp = await fetch(`${API_BASE}/invalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['semantic-cache'] });
    },
  });
}
/** Compress code on demand */
export function useCompressCode() {
  return useMutation({
    mutationFn: async (params) => {
      const resp = await fetch(`${API_BASE}/compress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
  });
}
