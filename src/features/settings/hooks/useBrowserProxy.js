/** Jaskier Shared Pattern — Browser Proxy Status Hook */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/shared/api/client';
export function useBrowserProxyStatus(polling = false) {
  return useQuery({
    queryKey: ['browser-proxy-status'],
    queryFn: () => apiGet('/api/browser-proxy/status'),
    refetchInterval: polling ? 3000 : false,
    refetchOnWindowFocus: false,
  });
}
export function useBrowserProxyLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost('/api/browser-proxy/login'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browser-proxy-status'] });
    },
  });
}
export function useBrowserProxyReinit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost('/api/browser-proxy/reinit'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browser-proxy-status'] });
    },
  });
}
export function useBrowserProxyLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete('/api/browser-proxy/logout'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browser-proxy-status'] });
    },
  });
}
