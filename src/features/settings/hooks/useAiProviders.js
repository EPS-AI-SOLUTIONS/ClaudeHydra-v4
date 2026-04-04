/** Jaskier Shared Pattern — Unified AI Provider Management Hook */
// useAiProviders.ts — Replaces: useOAuthStatus + useGoogleAuthStatus
// Uses: TanStack Query with 30s polling
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiGet, apiPost } from '@/shared/api/client';

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------
const AI_PROVIDERS_KEY = ['ai-providers'];
// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useAiProviders() {
  const queryClient = useQueryClient();
  // Fetch all providers with 30s polling
  const {
    data: providers = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: AI_PROVIDERS_KEY,
    queryFn: () => apiGet('/api/ai/providers'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: (provider) => apiPost(`/api/ai/providers/${provider}/connect`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
    },
  });
  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: (provider) => apiPost(`/api/ai/providers/${provider}/disconnect`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
    },
  });
  // Test mutation
  const testMutation = useMutation({
    mutationFn: (provider) => apiPost(`/api/ai/providers/${provider}/test`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
    },
  });
  // Refresh mutation
  const refreshMutation = useMutation({
    mutationFn: (provider) => apiPost(`/api/ai/providers/${provider}/refresh`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
    },
  });
  // Derived values
  const totalMonthlyCost = useMemo(
    () => providers.filter((p) => p.is_connected).reduce((sum, p) => sum + p.monthly_cost_cents, 0),
    [providers],
  );
  const connectedCount = useMemo(() => providers.filter((p) => p.is_connected).length, [providers]);
  return {
    providers,
    isLoading,
    error: error,
    connectProvider: (provider) => connectMutation.mutateAsync(provider),
    disconnectProvider: (provider) => disconnectMutation.mutateAsync(provider),
    testProvider: (provider) => testMutation.mutateAsync(provider),
    refreshProvider: (provider) => refreshMutation.mutateAsync(provider),
    totalMonthlyCost,
    connectedCount,
  };
}
