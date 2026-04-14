// src/features/logs/hooks/useLogs.ts
import { useQuery } from '@tanstack/react-query';
import { apiDelete, apiGet } from '@/shared/api/client';

// ============================================
// HOOKS
// ============================================
function buildParams(params) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== '',
  );
  if (entries.length === 0) return '';
  return `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}`;
}
export function useBackendLogs(filters, autoRefresh) {
  const params = buildParams({
    limit: filters.limit,
    level: filters.level,
    search: filters.search,
  });
  return useQuery({
    queryKey: ['logs-backend', filters],
    queryFn: () => apiGet(`/api/logs/backend${params}`),
    refetchInterval: autoRefresh ? 5000 : false,
    retry: 1,
    staleTime: 2000,
  });
}
export async function clearBackendLogs() {
  await apiDelete('/api/logs/backend');
}
