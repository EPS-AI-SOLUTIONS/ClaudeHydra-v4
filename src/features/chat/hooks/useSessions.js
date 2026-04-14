/**
 * Session management TanStack Query hooks.
 * CRUD operations for chat sessions and message persistence.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/shared/api/client';
/** GET /api/sessions/:id — full session with messages + tool_interactions */
export function useSessionDetailQuery(sessionId) {
  return useQuery({
    queryKey: ['session-detail', sessionId],
    queryFn: () => apiGet(`/api/sessions/${sessionId}`),
    enabled: !!sessionId,
    staleTime: 60_000,
  });
}
/** GET /api/sessions — backend returns { sessions: [...], has_more, next_cursor } */
export function useSessionsQuery() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const data = await apiGet('/api/sessions');
      return Array.isArray(data) ? data : (data.sessions ?? []);
    },
  });
}
/** POST /api/sessions */
export function useCreateSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => apiPost('/api/sessions', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Operation failed');
    },
  });
}
/** PATCH /api/sessions/:id */
export function useUpdateSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }) => apiPatch(`/api/sessions/${id}`, { title }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Operation failed');
    },
  });
}
/** DELETE /api/sessions/:id */
export function useDeleteSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiDelete(`/api/sessions/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Operation failed');
    },
  });
}
/** POST /api/sessions/:id/generate-title */
export function useGenerateTitleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId) =>
      apiPost(`/api/sessions/${sessionId}/generate-title`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}
/** POST /api/sessions/:id/messages */
export function useAddMessageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, ...body }) =>
      apiPost(`/api/sessions/${sessionId}/messages`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['session', variables.sessionId],
      });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Operation failed');
    },
  });
}
