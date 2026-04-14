/** Jaskier Shared Pattern — Vault Health Monitoring Hook */
// useVaultStatus.ts — Hook for Jaskier Vault health & audit
import {
  VAULT_API,
  VAULT_POLLING,
  VAULT_QUERY_KEYS,
} from '@jaskier/vault-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/shared/api/client';
// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useVaultStatus() {
  const queryClient = useQueryClient();
  // Health check with 60s polling
  const { data: health = null, isLoading: isHealthLoading } = useQuery({
    queryKey: [...VAULT_QUERY_KEYS.health],
    queryFn: () => apiGet(VAULT_API.health),
    refetchInterval: VAULT_POLLING.health,
    refetchOnWindowFocus: false,
  });
  // Audit log with 60s polling
  const { data: auditLog = [], isLoading: isAuditLoading } = useQuery({
    queryKey: [...VAULT_QUERY_KEYS.audit],
    queryFn: () => apiGet(VAULT_API.audit),
    refetchInterval: VAULT_POLLING.audit,
    refetchOnWindowFocus: false,
  });
  // Emergency panic mutation
  const panicMutation = useMutation({
    mutationFn: () => apiPost(VAULT_API.panic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...VAULT_QUERY_KEYS.health] });
      queryClient.invalidateQueries({ queryKey: [...VAULT_QUERY_KEYS.audit] });
    },
  });
  // Rotate all credentials mutation
  const rotateMutation = useMutation({
    mutationFn: () => apiPost(VAULT_API.rotate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...VAULT_QUERY_KEYS.health] });
      queryClient.invalidateQueries({ queryKey: [...VAULT_QUERY_KEYS.audit] });
    },
  });
  return {
    health,
    auditLog,
    isLoading: isHealthLoading || isAuditLoading,
    isOnline: health?.online ?? false,
    triggerPanic: () => panicMutation.mutateAsync(),
    rotateAll: () => rotateMutation.mutateAsync(),
  };
}
