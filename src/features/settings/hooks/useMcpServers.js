/** Jaskier Shared Pattern — MCP Server hooks */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/shared/api/client';
export function useMcpServers() {
  return useQuery({
    queryKey: ['mcp-servers'],
    queryFn: () => apiGet('/api/mcp/servers'),
    staleTime: 10_000,
  });
}
export function useMcpServerTools(serverId) {
  return useQuery({
    queryKey: ['mcp-server-tools', serverId],
    queryFn: () => apiGet(`/api/mcp/servers/${serverId}/tools`),
    enabled: !!serverId,
    staleTime: 30_000,
  });
}
export function useCreateMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => apiPost('/api/mcp/servers', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp-servers'] }),
  });
}
export function useDeleteMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiDelete(`/api/mcp/servers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp-servers'] }),
  });
}
export function useConnectMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiPost(`/api/mcp/servers/${id}/connect`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp-servers'] }),
  });
}
export function useDisconnectMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiPost(`/api/mcp/servers/${id}/disconnect`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp-servers'] }),
  });
}
