/**
 * History page hook — re-exports useSessionsQuery for the history view.
 * Wraps the sessions query so the history feature has its own entry point.
 */

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import type { SessionsList } from '@/shared/api/schemas';

/** GET /api/sessions — used by the history view */
export function useSessionsQuery() {
  return useQuery<SessionsList>({
    queryKey: ['sessions'],
    queryFn: () => apiGet<SessionsList>('/api/sessions'),
  });
}
