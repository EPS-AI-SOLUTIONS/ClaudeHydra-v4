/** Jaskier Shared Pattern — MCP Servers Settings Section */
import { useViewTheme } from '@jaskier/chat-module';
import { Button, cn, Input } from '@jaskier/ui';
import { memo, useCallback, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import ChevronDown from '~icons/lucide/chevron-down';
import ChevronRight from '~icons/lucide/chevron-right';
import Network from '~icons/lucide/network';
import Plus from '~icons/lucide/plus';
import Power from '~icons/lucide/power';
import PowerOff from '~icons/lucide/power-off';
import Trash2 from '~icons/lucide/trash-2';
import Wrench from '~icons/lucide/wrench';
import {
  useConnectMcpServer,
  useCreateMcpServer,
  useDeleteMcpServer,
  useDisconnectMcpServer,
  useMcpServers,
  useMcpServerTools,
} from '../hooks/useMcpServers';

// ── Add Server Form ──────────────────────────────────────────────────────────
function AddServerForm({ onClose }) {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const createMutation = useCreateMcpServer();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [timeout, setTimeout] = useState(30);
  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !url.trim()) return;
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        transport: 'http',
        url: url.trim(),
        auth_token: authToken.trim() || undefined,
        timeout_secs: timeout,
      });
      toast.success(t('mcp.serverAdded', 'MCP server added'));
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add server');
    }
  }, [name, url, authToken, timeout, createMutation, onClose, t]);
  return _jsxs('div', {
    className: cn('space-y-3 p-4 rounded-lg border', theme.border, theme.card),
    children: [
      _jsx(Input, {
        placeholder: t('mcp.name', 'Server Name'),
        value: name,
        onChange: (e) => setName(e.target.value),
        className: 'font-mono text-sm',
      }),
      _jsx(Input, {
        placeholder: t(
          'mcp.url',
          'Server URL (e.g. http://localhost:3000/mcp)',
        ),
        value: url,
        onChange: (e) => setUrl(e.target.value),
        className: 'font-mono text-sm',
      }),
      _jsx(Input, {
        placeholder: t('mcp.authToken', 'Auth Token (optional)'),
        type: 'password',
        value: authToken,
        onChange: (e) => setAuthToken(e.target.value),
        className: 'font-mono text-sm',
      }),
      _jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          _jsx('label', {
            htmlFor: 'mcp-timeout',
            className: cn('text-xs font-mono', theme.textMuted),
            children: t('mcp.timeout', 'Timeout (s)'),
          }),
          _jsx(Input, {
            id: 'mcp-timeout',
            type: 'number',
            min: 5,
            max: 120,
            value: timeout,
            onChange: (e) => setTimeout(Number(e.target.value)),
            className: 'font-mono text-sm w-20',
          }),
        ],
      }),
      _jsxs('div', {
        className: 'flex gap-2 justify-end',
        children: [
          _jsx(Button, {
            variant: 'ghost',
            size: 'sm',
            onClick: onClose,
            children: t('common.cancel', 'Cancel'),
          }),
          _jsx(Button, {
            size: 'sm',
            onClick: handleSubmit,
            disabled: !name.trim() || !url.trim() || createMutation.isPending,
            children: createMutation.isPending
              ? t('common.loading', 'Loading...')
              : t('mcp.addServer', 'Add Server'),
          }),
        ],
      }),
    ],
  });
}
// ── Server Tools List ────────────────────────────────────────────────────────
function ServerToolsList({ serverId }) {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: tools, isLoading } = useMcpServerTools(serverId);
  if (isLoading) {
    return _jsx('p', {
      className: cn('text-xs font-mono pl-6', theme.textMuted),
      children: t('common.loading', 'Loading...'),
    });
  }
  const toolsList = Array.isArray(tools) ? tools : [];
  if (!toolsList.length) {
    return _jsx('p', {
      className: cn('text-xs font-mono pl-6', theme.textMuted),
      children: t('mcp.noTools', 'No tools discovered'),
    });
  }
  return _jsx('div', {
    className: 'pl-6 space-y-1',
    children: toolsList.map((tool) =>
      _jsxs(
        'div',
        {
          className: 'flex items-start gap-2',
          children: [
            _jsx(Wrench, {
              width: 12,
              height: 12,
              className: 'text-[var(--matrix-accent)] mt-0.5 shrink-0',
            }),
            _jsxs('div', {
              children: [
                _jsx('span', {
                  className: cn('text-xs font-mono font-medium', theme.text),
                  children: tool.tool_name,
                }),
                tool.description &&
                  _jsx('p', {
                    className: cn('text-[10px] font-mono', theme.textMuted),
                    children: tool.description,
                  }),
              ],
            }),
          ],
        },
        tool.id,
      ),
    ),
  });
}
// ── Server Row ───────────────────────────────────────────────────────────────
function ServerRow({ server }) {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const [expanded, setExpanded] = useState(false);
  const connectMutation = useConnectMcpServer();
  const disconnectMutation = useDisconnectMcpServer();
  const deleteMutation = useDeleteMcpServer();
  const isConnected = server.enabled;
  const busy =
    connectMutation.isPending ||
    disconnectMutation.isPending ||
    deleteMutation.isPending;
  const handleToggle = useCallback(async () => {
    try {
      if (isConnected) {
        await disconnectMutation.mutateAsync(server.id);
        toast.success(t('mcp.disconnected', 'Disconnected'));
      } else {
        await connectMutation.mutateAsync(server.id);
        toast.success(t('mcp.connected', 'Connected'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [isConnected, server.id, connectMutation, disconnectMutation, t]);
  const handleDelete = useCallback(async () => {
    try {
      await deleteMutation.mutateAsync(server.id);
      toast.success(t('mcp.deleted', 'Server removed'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  }, [server.id, deleteMutation, t]);
  return _jsxs('div', {
    className: cn('rounded-lg border p-3 space-y-2', theme.border),
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          _jsx('button', {
            type: 'button',
            onClick: () => setExpanded(!expanded),
            className: 'p-0.5 hover:opacity-70 transition-opacity',
            'aria-label': 'Toggle tools',
            children: expanded
              ? _jsx(ChevronDown, {
                  width: 14,
                  height: 14,
                  className: theme.textMuted,
                })
              : _jsx(ChevronRight, {
                  width: 14,
                  height: 14,
                  className: theme.textMuted,
                }),
          }),
          _jsx('div', {
            className: cn(
              'w-2 h-2 rounded-full shrink-0',
              isConnected ? 'bg-emerald-400' : 'bg-zinc-500',
            ),
          }),
          _jsx('span', {
            className: cn('text-sm font-mono font-medium flex-1', theme.text),
            children: server.name,
          }),
          _jsx('span', {
            className: cn('text-[10px] font-mono', theme.textMuted),
            children: server.url ?? server.command,
          }),
          _jsx(Button, {
            variant: 'ghost',
            size: 'sm',
            onClick: handleToggle,
            disabled: busy,
            'aria-label': isConnected ? 'Disconnect' : 'Connect',
            children: isConnected
              ? _jsx(PowerOff, { width: 14, height: 14 })
              : _jsx(Power, { width: 14, height: 14 }),
          }),
          _jsx(Button, {
            variant: 'ghost',
            size: 'sm',
            onClick: handleDelete,
            disabled: busy,
            'aria-label': 'Delete',
            children: _jsx(Trash2, {
              width: 14,
              height: 14,
              className: 'text-red-400',
            }),
          }),
        ],
      }),
      expanded && _jsx(ServerToolsList, { serverId: server.id }),
    ],
  });
}
// ── Main Section ─────────────────────────────────────────────────────────────
export const McpServersSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: rawServers, isLoading } = useMcpServers();
  const servers = Array.isArray(rawServers) ? rawServers : [];
  const [showAddForm, setShowAddForm] = useState(false);
  return _jsxs('div', {
    className: 'space-y-4',
    children: [
      _jsxs('div', {
        className: 'flex items-center justify-between',
        children: [
          _jsxs('div', {
            className: 'flex items-center gap-2',
            children: [
              _jsx(Network, {
                width: 18,
                height: 18,
                className: 'text-[var(--matrix-accent)]',
              }),
              _jsx('h3', {
                className: cn(
                  'text-sm font-semibold font-mono uppercase tracking-wider',
                  theme.text,
                ),
                children: t('mcp.title', 'MCP Servers'),
              }),
            ],
          }),
          _jsxs(Button, {
            variant: 'ghost',
            size: 'sm',
            onClick: () => setShowAddForm(!showAddForm),
            children: [
              _jsx(Plus, { width: 14, height: 14 }),
              _jsx('span', {
                className: 'ml-1 text-xs',
                children: t('mcp.addServer', 'Add Server'),
              }),
            ],
          }),
        ],
      }),
      _jsx('p', {
        className: cn('text-xs', theme.textMuted),
        children: t(
          'mcp.description',
          'Connect external MCP servers to extend agent capabilities with additional tools.',
        ),
      }),
      showAddForm &&
        _jsx(AddServerForm, { onClose: () => setShowAddForm(false) }),
      isLoading &&
        _jsx('p', {
          className: cn('text-xs font-mono', theme.textMuted),
          children: t('common.loading', 'Loading...'),
        }),
      !isLoading &&
        !servers.length &&
        !showAddForm &&
        _jsx('p', {
          className: cn('text-xs font-mono', theme.textMuted),
          children: t('mcp.noServers', 'No MCP servers configured'),
        }),
      _jsx('div', {
        className: 'space-y-2',
        children: servers.map((server) =>
          _jsx(ServerRow, { server: server }, server.id),
        ),
      }),
    ],
  });
});
McpServersSection.displayName = 'McpServersSection';
