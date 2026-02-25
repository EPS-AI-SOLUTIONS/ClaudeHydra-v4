/**
 * useClaudeModels — fetches dynamically resolved Claude models from the backend.
 *
 * Falls back to a hardcoded list when the backend is unreachable or during
 * initial loading so the model selector is never empty.
 */

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';

// ---------------------------------------------------------------------------
// Types (mirrors backend ClaudeModelInfo)
// ---------------------------------------------------------------------------

export interface ClaudeModel {
  id: string;
  name: string;
  tier: string;
  provider: string;
  available: boolean;
}

// ---------------------------------------------------------------------------
// Fallback models (used while loading or if the backend is down)
// ---------------------------------------------------------------------------

export const FALLBACK_CLAUDE_MODELS: ClaudeModel[] = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', tier: 'Commander', provider: 'anthropic', available: true },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', tier: 'Coordinator', provider: 'anthropic', available: true },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', tier: 'Executor', provider: 'anthropic', available: true },
];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useClaudeModels() {
  return useQuery<ClaudeModel[]>({
    queryKey: ['claude-models'],
    queryFn: () => apiGet<ClaudeModel[]>('/api/claude/models'),
    staleTime: 60 * 60 * 1000, // 1 hour — models rarely change at runtime
    placeholderData: FALLBACK_CLAUDE_MODELS,
    refetchOnWindowFocus: false,
  });
}
