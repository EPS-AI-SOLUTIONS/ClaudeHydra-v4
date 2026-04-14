// src/features/analytics/hooks/useAnalytics.ts
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';

// ============================================
// HOOKS
// ============================================
const REFETCH_INTERVAL = 60_000; // 60 seconds
export function useTokenUsage(days) {
  return useQuery({
    queryKey: ['analytics-tokens', days],
    queryFn: () => apiGet(`/api/analytics/tokens?days=${days}`),
    refetchInterval: REFETCH_INTERVAL,
    retry: 1,
    staleTime: 30_000,
  });
}
export function useLatency(days) {
  return useQuery({
    queryKey: ['analytics-latency', days],
    queryFn: () => apiGet(`/api/analytics/latency?days=${days}`),
    refetchInterval: REFETCH_INTERVAL,
    retry: 1,
    staleTime: 30_000,
  });
}
export function useSuccessRate(days) {
  return useQuery({
    queryKey: ['analytics-success-rate', days],
    queryFn: () => apiGet(`/api/analytics/success-rate?days=${days}`),
    refetchInterval: REFETCH_INTERVAL,
    retry: 1,
    staleTime: 30_000,
  });
}
export function useTopTools(days, limit = 10) {
  return useQuery({
    queryKey: ['analytics-top-tools', days, limit],
    queryFn: () =>
      apiGet(`/api/analytics/top-tools?days=${days}&limit=${limit}`),
    refetchInterval: REFETCH_INTERVAL,
    retry: 1,
    staleTime: 30_000,
  });
}
export function useCostEstimate(days) {
  return useQuery({
    queryKey: ['analytics-cost', days],
    queryFn: () => apiGet(`/api/analytics/cost?days=${days}`),
    refetchInterval: REFETCH_INTERVAL,
    retry: 1,
    staleTime: 30_000,
  });
}
