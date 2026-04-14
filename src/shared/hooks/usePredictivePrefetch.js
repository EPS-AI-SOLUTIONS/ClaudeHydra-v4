/**
 * usePredictivePrefetch — Predictive UI Pre-fetching (Task 34).
 *
 * Two prefetch strategies:
 * 1. **AI-driven (WS hints)**: Backend analyzes prompt keywords and emits
 *    `view_hint` WS events with suggested views → hook triggers dynamic imports.
 * 2. **Hover-based**: Sidebar nav `onPointerEnter` triggers chunk prefetch
 *    after a short debounce (150ms).
 *
 * Also prefetches TanStack Query data for known view queries when hints arrive.
 */
import { useCallback, useEffect, useRef } from 'react';
import { queryClient } from '@/shared/api/queryClient';
import { env } from '@/shared/config/env';

// ---------------------------------------------------------------------------
// View Import Registry (same factories as main.tsx lazy() calls)
// ---------------------------------------------------------------------------
const viewImportMap = {
  home: () => import('@/features/home/components/HomePage'),
  chat: () => import('@/features/chat/components/ClaudeChatView'),
  agents: () => import('@/features/agents/components/AgentsView'),
  settings: () => import('@/features/settings/components/SettingsView'),
  logs: () => import('@/features/logs/components/LogsView'),
  delegations: () =>
    import('@/features/delegations/components/DelegationsView'),
  analytics: () => import('@/features/analytics/components/AnalyticsView'),
  swarm: () => import('@/features/swarm/components/SwarmView'),
  'semantic-cache': () =>
    import('@/features/semantic-cache/components/SemanticCacheView'),
  collab: () => import('@/features/collab/components/CollabView'),
};
// ---------------------------------------------------------------------------
// Query prefetch definitions — maps view → TanStack Query keys to prefetch
// ---------------------------------------------------------------------------
function getApiBase() {
  return env.VITE_BACKEND_URL || '';
}
const viewQueryMap = {
  analytics: [
    {
      queryKey: ['analytics', 'summary'],
      queryFn: () =>
        fetch(`${getApiBase()}/api/analytics/summary`).then((r) => r.json()),
    },
  ],
  logs: [
    {
      queryKey: ['logs', 'backend'],
      queryFn: () =>
        fetch(`${getApiBase()}/api/logs/backend?limit=50`).then((r) =>
          r.json(),
        ),
    },
  ],
  agents: [
    {
      queryKey: ['agents'],
      queryFn: () => fetch(`${getApiBase()}/api/agents`).then((r) => r.json()),
    },
  ],
  settings: [
    {
      queryKey: ['settings'],
      queryFn: () =>
        fetch(`${getApiBase()}/api/settings`).then((r) => r.json()),
    },
  ],
  swarm: [
    {
      queryKey: ['swarm', 'peers'],
      queryFn: () =>
        fetch(`${getApiBase()}/api/swarm/peers`).then((r) => r.json()),
    },
  ],
  'semantic-cache': [
    {
      queryKey: ['semantic-cache', 'stats'],
      queryFn: () =>
        fetch(`${getApiBase()}/api/semantic-cache/stats`).then((r) => r.json()),
    },
  ],
};
// ---------------------------------------------------------------------------
// Prefetch tracking — avoid re-fetching already loaded chunks
// ---------------------------------------------------------------------------
const prefetchedChunks = new Set();
/**
 * Prefetch a view's JS chunk (dynamic import) and associated query data.
 * Safe to call multiple times — deduplicates automatically.
 */
function prefetchView(viewId) {
  if (prefetchedChunks.has(viewId)) return;
  const importFn = viewImportMap[viewId];
  if (importFn) {
    prefetchedChunks.add(viewId);
    // Fire-and-forget: load the JS/CSS chunk in background
    importFn().catch(() => {
      // If import fails (network), remove from set so retry is possible
      prefetchedChunks.delete(viewId);
    });
  }
  // Prefetch TanStack Query data (staleTime-aware, won't refetch if fresh)
  const queries = viewQueryMap[viewId];
  if (queries) {
    for (const q of queries) {
      queryClient.prefetchQuery({
        queryKey: q.queryKey,
        queryFn: q.queryFn,
        staleTime: 30_000,
      });
    }
  }
}
// ---------------------------------------------------------------------------
// Hook: usePredictivePrefetch
// ---------------------------------------------------------------------------
/**
 * Enables predictive UI pre-fetching.
 *
 * Returns `prefetchOnHover(viewId)` — call from nav button `onPointerEnter`.
 * Also listens to `view_hint` WS events globally via a custom event bus.
 */
export function usePredictivePrefetch() {
  const hoverTimerRef = useRef(null);
  // Listen to custom 'viewhint' events dispatched by WebSocket message handler
  useEffect(() => {
    function handleViewHint(e) {
      const detail = e.detail;
      if (detail?.views) {
        for (const view of detail.views) {
          prefetchView(view);
        }
      }
    }
    window.addEventListener('viewhint', handleViewHint);
    return () => window.removeEventListener('viewhint', handleViewHint);
  }, []);
  /**
   * Prefetch on hover — call from sidebar nav button `onPointerEnter`.
   * Debounces 150ms to avoid prefetching on accidental hover-through.
   */
  const prefetchOnHover = useCallback((viewId) => {
    if (prefetchedChunks.has(viewId)) return;
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = setTimeout(() => {
      prefetchView(viewId);
    }, 150);
  }, []);
  /** Cancel pending hover prefetch (call on pointerLeave). */
  const cancelHoverPrefetch = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);
  return { prefetchOnHover, cancelHoverPrefetch, prefetchView };
}
// ---------------------------------------------------------------------------
// Utility: dispatch view hint event from WS message handler
// ---------------------------------------------------------------------------
/**
 * Call this from the WS message parser when a `view_hint` event arrives.
 * Dispatches a custom DOM event that usePredictivePrefetch listens to.
 */
export function dispatchViewHint(views) {
  window.dispatchEvent(new CustomEvent('viewhint', { detail: { views } }));
}
