/**
 * Chat-related TanStack Query hooks.
 * Covers Ollama model listing and both Ollama / Claude chat mutations.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/shared/api/client';
import type {
  ClaudeChatRequest,
  ClaudeChatResponse,
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaModels,
} from '@/shared/api/schemas';

/** GET /api/ollama/models */
export function useOllamaModelsQuery() {
  return useQuery<OllamaModels>({
    queryKey: ['ollama-models'],
    queryFn: () => apiGet<OllamaModels>('/api/ollama/models'),
  });
}

/** POST /api/ollama/chat */
export function useOllamaChatMutation() {
  return useMutation<OllamaChatResponse, Error, OllamaChatRequest>({
    mutationFn: (body) => apiPost<OllamaChatResponse>('/api/ollama/chat', body),
  });
}

/** POST /api/claude/chat */
export function useClaudeChatMutation() {
  return useMutation<ClaudeChatResponse, Error, ClaudeChatRequest>({
    mutationFn: (body) => apiPost<ClaudeChatResponse>('/api/claude/chat', body),
  });
}
