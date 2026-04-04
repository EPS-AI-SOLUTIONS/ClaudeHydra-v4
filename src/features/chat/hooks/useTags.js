/**
 * useTags — TanStack Query hooks for session tagging and full-text search.
 *
 * Endpoints:
 * - GET    /api/sessions/:id/tags       — tags for a session
 * - POST   /api/sessions/:id/tags       — add tags
 * - DELETE /api/sessions/:id/tags/:tag  — remove a tag
 * - GET    /api/sessions/search         — full-text search + tag filter
 * - GET    /api/tags                    — all unique tags with counts
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPost } from '@/shared/api/client';
// ── Queries ──────────────────────────────────────────────────────────────
/** GET /api/sessions/:id/tags — fetch tags for a single session */
export function useSessionTagsQuery(sessionId) {
  return useQuery({
    queryKey: ['session-tags', sessionId],
    queryFn: () => apiGet(`/api/sessions/${sessionId}/tags`),
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}
/** GET /api/tags — all unique tags with counts */
export function useAllTagsQuery() {
  return useQuery({
    queryKey: ['all-tags'],
    queryFn: () => apiGet('/api/tags'),
    staleTime: 60_000,
  });
}
/** GET /api/sessions/search — full-text search + tag filter */
export function useSearchQuery(query, tags, enabled = true) {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (tags.length > 0) params.set('tags', tags.join(','));
  const hasSearch = query.trim().length > 0 || tags.length > 0;
  return useQuery({
    queryKey: ['session-search', query, tags],
    queryFn: () => apiGet(`/api/sessions/search?${params.toString()}`),
    enabled: enabled && hasSearch,
    staleTime: 15_000,
  });
}
// ── Mutations ────────────────────────────────────────────────────────────
/** POST /api/sessions/:id/tags — add tags to a session */
export function useAddTagsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, tags }) => apiPost(`/api/sessions/${sessionId}/tags`, { tags }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['session-tags', variables.sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['all-tags'] });
      void queryClient.invalidateQueries({ queryKey: ['session-search'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add tags');
    },
  });
}
/** DELETE /api/sessions/:id/tags/:tag — remove a tag */
export function useRemoveTagMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, tag }) => apiDelete(`/api/sessions/${sessionId}/tags/${encodeURIComponent(tag)}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['session-tags', variables.sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['all-tags'] });
      void queryClient.invalidateQueries({ queryKey: ['session-search'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to remove tag');
    },
  });
}
