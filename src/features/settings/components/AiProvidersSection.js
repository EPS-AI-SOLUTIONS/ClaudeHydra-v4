/** Jaskier Shared Pattern — Unified AI Providers Management Section */
import { useViewTheme } from '@jaskier/chat-module';
import { Badge, Button, cn } from '@jaskier/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useState } from 'react';
import {
  Fragment as _Fragment,
  jsx as _jsx,
  jsxs as _jsxs,
} from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/shared/api/client';
import AlertTriangle from '~icons/lucide/alert-triangle';
import CheckCircle from '~icons/lucide/check-circle';
import Clock from '~icons/lucide/clock';
import Loader2 from '~icons/lucide/loader-2';
import LogIn from '~icons/lucide/log-in';
import LogOut from '~icons/lucide/log-out';
import RefreshCw from '~icons/lucide/refresh-cw';
import Shield from '~icons/lucide/shield';
import Wifi from '~icons/lucide/wifi';
import WifiOff from '~icons/lucide/wifi-off';
import Zap from '~icons/lucide/zap';

// ── Constants ──────────────────────────────────────────────────────────────────
const PROVIDER_META = {
  anthropic: {
    icon: '\u{1F7E3}',
    color: 'text-purple-400',
    accent: 'border-purple-500/30',
  },
  openai: {
    icon: '\u{1F7E2}',
    color: 'text-green-400',
    accent: 'border-green-500/30',
  },
  google: {
    icon: '\u{1F535}',
    color: 'text-blue-400',
    accent: 'border-blue-500/30',
  },
  xai: {
    icon: '\u26A1',
    color: 'text-yellow-400',
    accent: 'border-yellow-500/30',
  },
  deepseek: {
    icon: '\u{1F537}',
    color: 'text-cyan-400',
    accent: 'border-cyan-500/30',
  },
  ollama: {
    icon: '\u{1F999}',
    color: 'text-orange-400',
    accent: 'border-orange-500/30',
  },
};
const cardVariants = {
  initial: { opacity: 0, scale: 0.95, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, scale: 0.95, y: -8, transition: { duration: 0.15 } },
};
const STATUS_BADGE = {
  connected: { variant: 'accent', color: 'text-emerald-400' },
  disconnected: { variant: 'default', color: 'text-zinc-500' },
  expiring: { variant: 'default', color: 'text-amber-400' },
  error: { variant: 'error', color: 'text-red-400' },
};
// ── Helpers ────────────────────────────────────────────────────────────────────
function getAuthStatus(p) {
  if (p.last_error) return 'error';
  if (!p.is_connected) return 'disconnected';
  if (p.last_verified) {
    const verified = new Date(p.last_verified).getTime();
    const hourAgo = Date.now() - 60 * 60 * 1000;
    if (verified < hourAgo) return 'expiring';
  }
  return 'connected';
}
function formatCost(cents) {
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(0)}/mo`;
}
function formatVerified(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString();
}
function getMeta(provider) {
  return (
    PROVIDER_META[provider.toLowerCase()] ?? {
      icon: '\u{1F916}',
      color: 'text-zinc-400',
      accent: 'border-zinc-500/30',
    }
  );
}
const ProviderCard = memo(
  ({
    provider: p,
    onConnect,
    onDisconnect,
    onTest,
    isConnecting,
    isDisconnecting,
    isTesting,
  }) => {
    const { t } = useTranslation();
    const theme = useViewTheme();
    const meta = getMeta(p.provider);
    const status = getAuthStatus(p);
    const badge = STATUS_BADGE[status];
    const [confirmDisconnect, setConfirmDisconnect] = useState(false);
    const handleDisconnect = useCallback(() => {
      if (!confirmDisconnect) {
        setConfirmDisconnect(true);
        setTimeout(() => setConfirmDisconnect(false), 3000);
        return;
      }
      setConfirmDisconnect(false);
      onDisconnect(p.provider);
    }, [confirmDisconnect, onDisconnect, p.provider]);
    return _jsxs(motion.div, {
      layout: true,
      variants: cardVariants,
      initial: 'initial',
      animate: 'animate',
      exit: 'exit',
      className: cn(
        'relative rounded-lg border p-4 space-y-3',
        'bg-[var(--matrix-glass)] backdrop-blur-sm',
        'transition-colors duration-200',
        meta.accent,
        p.is_connected && 'ring-1 ring-emerald-500/20',
      ),
      children: [
        _jsxs('div', {
          className: 'flex items-start justify-between gap-2',
          children: [
            _jsxs('div', {
              className: 'flex items-center gap-2.5 min-w-0',
              children: [
                _jsx('span', {
                  className: 'text-xl leading-none shrink-0',
                  role: 'img',
                  'aria-label': p.provider,
                  children: meta.icon,
                }),
                _jsxs('div', {
                  className: 'min-w-0',
                  children: [
                    _jsx('h4', {
                      className: cn(
                        'text-sm font-semibold font-mono truncate',
                        theme.text,
                      ),
                      children: p.plan_name,
                    }),
                    _jsx('span', {
                      className: cn(
                        'text-[10px] font-mono uppercase tracking-wider',
                        theme.textMuted,
                      ),
                      children: p.provider,
                    }),
                  ],
                }),
              ],
            }),
            _jsx(Badge, {
              variant: badge.variant,
              size: 'sm',
              icon:
                status === 'connected'
                  ? _jsx(CheckCircle, { width: 10, height: 10 })
                  : status === 'error'
                    ? _jsx(AlertTriangle, { width: 10, height: 10 })
                    : status === 'expiring'
                      ? _jsx(Clock, { width: 10, height: 10 })
                      : _jsx(WifiOff, { width: 10, height: 10 }),
              children: t(`settings.providers.status.${status}`, status),
            }),
          ],
        }),
        _jsxs('div', {
          className: 'flex items-center gap-2 flex-wrap',
          children: [
            p.plan_tier &&
              _jsx('span', {
                className: cn(
                  'inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded',
                  'bg-[var(--matrix-accent)]/15 text-[var(--matrix-accent)]',
                ),
                children: p.plan_tier,
              }),
            _jsx('span', {
              className: cn('text-xs font-mono', theme.textMuted),
              children: formatCost(p.monthly_cost_cents),
            }),
            _jsx('span', {
              className: cn('text-[10px] font-mono ml-auto', theme.textMuted),
              children: p.auth_type,
            }),
          ],
        }),
        _jsxs('div', {
          className: 'flex items-center gap-1.5',
          children: [
            _jsx(Clock, { width: 10, height: 10, className: theme.textMuted }),
            _jsxs('span', {
              className: cn('text-[10px] font-mono', theme.textMuted),
              children: [
                t('settings.providers.lastVerified', 'Verified'),
                ':',
                ' ',
                formatVerified(p.last_verified),
              ],
            }),
          ],
        }),
        p.last_error &&
          _jsxs('div', {
            className: 'flex items-start gap-1.5 text-red-400',
            children: [
              _jsx(AlertTriangle, {
                width: 12,
                height: 12,
                className: 'shrink-0 mt-0.5',
              }),
              _jsx('span', {
                className: 'text-[10px] font-mono leading-tight line-clamp-2',
                children: p.last_error,
              }),
            ],
          }),
        _jsx('div', {
          className: 'flex items-center gap-2 pt-1 border-t border-white/5',
          children: p.is_connected
            ? _jsxs(_Fragment, {
                children: [
                  _jsx(Button, {
                    variant: confirmDisconnect ? 'danger' : 'ghost',
                    size: 'sm',
                    leftIcon: _jsx(LogOut, { width: 12, height: 12 }),
                    onClick: handleDisconnect,
                    isLoading: isDisconnecting,
                    disabled: isDisconnecting,
                    className: 'flex-1 text-xs',
                    children: confirmDisconnect
                      ? t('settings.providers.confirmDisconnect', 'Confirm?')
                      : t('settings.providers.disconnect', 'Disconnect'),
                  }),
                  _jsx(Button, {
                    variant: 'ghost',
                    size: 'sm',
                    leftIcon: isTesting
                      ? _jsx(Loader2, {
                          width: 12,
                          height: 12,
                          className: 'animate-spin',
                        })
                      : _jsx(Wifi, { width: 12, height: 12 }),
                    onClick: () => onTest(p.provider),
                    isLoading: isTesting,
                    disabled: isTesting,
                    className: 'text-xs',
                    children: t('settings.providers.test', 'Test'),
                  }),
                ],
              })
            : _jsx(Button, {
                variant: 'primary',
                size: 'sm',
                leftIcon: _jsx(LogIn, { width: 12, height: 12 }),
                onClick: () => onConnect(p.provider),
                isLoading: isConnecting,
                disabled: isConnecting,
                className: 'flex-1 text-xs',
                children: t('settings.providers.connect', 'Connect'),
              }),
        }),
      ],
    });
  },
);
ProviderCard.displayName = 'ProviderCard';
// ── SummaryFooter ──────────────────────────────────────────────────────────────
const SummaryFooter = memo(({ providers }) => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const connected = providers.filter((p) => p.is_connected);
  const totalCostCents = connected.reduce(
    (sum, p) => sum + p.monthly_cost_cents,
    0,
  );
  const hasErrors = providers.some((p) => p.last_error);
  return _jsxs('div', {
    className: cn(
      'flex items-center justify-between flex-wrap gap-3 pt-4 mt-2',
      'border-t border-white/10',
    ),
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          _jsx(Zap, {
            width: 14,
            height: 14,
            className: 'text-[var(--matrix-accent)]',
          }),
          _jsx('span', {
            className: cn('text-xs font-mono', theme.text),
            children: t(
              'settings.providers.connectedCount',
              '{{count}}/{{total}} connected',
              {
                count: connected.length,
                total: providers.length,
              },
            ),
          }),
        ],
      }),
      _jsx('div', {
        className: 'flex items-center gap-2',
        children: _jsxs('span', {
          className: cn('text-xs font-mono font-semibold', theme.text),
          children: [
            t('settings.providers.totalCost', 'Total'),
            ': $',
            (totalCostCents / 100).toFixed(0),
            '/mo',
          ],
        }),
      }),
      _jsxs('div', {
        className: 'flex items-center gap-1.5',
        children: [
          _jsx('div', {
            className: cn(
              'w-2 h-2 rounded-full',
              hasErrors ? 'bg-red-500 animate-pulse' : 'bg-emerald-500',
            ),
          }),
          _jsx('span', {
            className: cn('text-[10px] font-mono', theme.textMuted),
            children: t('settings.providers.vault', 'Vault'),
          }),
        ],
      }),
    ],
  });
});
SummaryFooter.displayName = 'SummaryFooter';
// ── Main Component ─────────────────────────────────────────────────────────────
export default function AiProvidersSection() {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const queryClient = useQueryClient();
  // ── Data Fetching ──
  const {
    data: providers,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: () => apiGet('/api/ai/providers'),
    refetchInterval: 30000,
  });
  // ── Mutations ──
  const [actionTarget, setActionTarget] = useState(null);
  const [actionType, setActionType] = useState(null);
  const connectMutation = useMutation({
    mutationFn: async (provider) => {
      setActionTarget(provider);
      setActionType('connect');
      const res = await apiPost(`/api/ai/providers/${provider}/connect`, {});
      return { provider, ...res };
    },
    onSuccess: (data) => {
      if (data.authorize_url) {
        window.open(data.authorize_url, '_blank', 'noopener,noreferrer');
        toast.info(
          t(
            'settings.providers.oauthRedirect',
            'Opening authorization page...',
          ),
        );
      } else {
        toast.success(
          t('settings.providers.connectSuccess', '{{provider}} connected', {
            provider: data.provider,
          }),
        );
      }
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
    },
    onError: (err) => {
      toast.error(
        err.message ||
          t('settings.providers.connectError', 'Connection failed'),
      );
    },
    onSettled: () => {
      setActionTarget(null);
      setActionType(null);
    },
  });
  const disconnectMutation = useMutation({
    mutationFn: async (provider) => {
      setActionTarget(provider);
      setActionType('disconnect');
      await apiPost(`/api/ai/providers/${provider}/disconnect`, {});
      return provider;
    },
    onSuccess: (provider) => {
      toast.success(
        t('settings.providers.disconnectSuccess', '{{provider}} disconnected', {
          provider,
        }),
      );
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
    },
    onError: (err) => {
      toast.error(
        err.message ||
          t('settings.providers.disconnectError', 'Disconnect failed'),
      );
    },
    onSettled: () => {
      setActionTarget(null);
      setActionType(null);
    },
  });
  const testMutation = useMutation({
    mutationFn: async (provider) => {
      setActionTarget(provider);
      setActionType('test');
      const res = await apiPost(`/api/ai/providers/${provider}/test`, {});
      return { provider, ...res };
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast.success(
          t('settings.providers.testSuccess', '{{provider}} OK ({{ms}}ms)', {
            provider: data.provider,
            ms: data.latency_ms ?? '?',
          }),
        );
      } else {
        toast.error(
          t('settings.providers.testFailed', '{{provider}} test failed', {
            provider: data.provider,
          }),
        );
      }
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
    },
    onError: (err) => {
      toast.error(
        err.message || t('settings.providers.testError', 'Test failed'),
      );
    },
    onSettled: () => {
      setActionTarget(null);
      setActionType(null);
    },
  });
  // ── Handlers ──
  const handleConnect = useCallback(
    (provider) => connectMutation.mutate(provider),
    [connectMutation],
  );
  const handleDisconnect = useCallback(
    (provider) => disconnectMutation.mutate(provider),
    [disconnectMutation],
  );
  const handleTest = useCallback(
    (provider) => testMutation.mutate(provider),
    [testMutation],
  );
  // ── Render ──
  return _jsxs('div', {
    className: 'space-y-5',
    children: [
      _jsxs('div', {
        className: 'flex items-center justify-between gap-2',
        children: [
          _jsxs('div', {
            className: 'flex items-center gap-2',
            children: [
              _jsx(Shield, {
                width: 18,
                height: 18,
                className: 'text-[var(--matrix-accent)]',
              }),
              _jsx('h3', {
                className: cn(
                  'text-sm font-semibold font-mono uppercase tracking-wider',
                  theme.text,
                ),
                children: t('settings.providers.title', 'AI Providers'),
              }),
            ],
          }),
          _jsx(Button, {
            variant: 'ghost',
            size: 'sm',
            leftIcon: _jsx(RefreshCw, {
              width: 12,
              height: 12,
              className: isLoading ? 'animate-spin' : '',
            }),
            onClick: () => refetch(),
            disabled: isLoading,
            className: 'text-xs',
            children: t('settings.providers.refresh', 'Refresh'),
          }),
        ],
      }),
      _jsx('p', {
        className: cn('text-xs', theme.textMuted),
        children: t(
          'settings.providers.description',
          'Manage connections to AI providers. Credentials are stored securely in the Jaskier Vault.',
        ),
      }),
      isLoading &&
        !providers &&
        _jsxs('div', {
          className: 'flex items-center justify-center gap-2 py-8',
          children: [
            _jsx(Loader2, {
              width: 20,
              height: 20,
              className: 'text-[var(--matrix-accent)] animate-spin',
            }),
            _jsx('span', {
              className: cn('text-sm font-mono', theme.textMuted),
              children: t('settings.providers.loading', 'Loading providers...'),
            }),
          ],
        }),
      isError &&
        _jsxs('div', {
          className: 'flex items-center gap-2 py-4 text-red-400',
          children: [
            _jsx(AlertTriangle, { width: 16, height: 16 }),
            _jsx('span', {
              className: 'text-xs font-mono',
              children: t(
                'settings.providers.fetchError',
                'Failed to load providers. Check backend connection.',
              ),
            }),
          ],
        }),
      providers &&
        providers.length > 0 &&
        _jsx(AnimatePresence, {
          mode: 'popLayout',
          children: _jsx('div', {
            className: 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3',
            children: providers.map((p) =>
              _jsx(
                ProviderCard,
                {
                  provider: p,
                  onConnect: handleConnect,
                  onDisconnect: handleDisconnect,
                  onTest: handleTest,
                  isConnecting:
                    actionTarget === p.provider && actionType === 'connect',
                  isDisconnecting:
                    actionTarget === p.provider && actionType === 'disconnect',
                  isTesting:
                    actionTarget === p.provider && actionType === 'test',
                },
                p.provider,
              ),
            ),
          }),
        }),
      providers &&
        providers.length === 0 &&
        _jsxs('div', {
          className: 'flex flex-col items-center justify-center gap-2 py-8',
          children: [
            _jsx(WifiOff, {
              width: 24,
              height: 24,
              className: theme.textMuted,
            }),
            _jsx('span', {
              className: cn('text-sm font-mono', theme.textMuted),
              children: t(
                'settings.providers.empty',
                'No providers configured',
              ),
            }),
          ],
        }),
      providers &&
        providers.length > 0 &&
        _jsx(SummaryFooter, { providers: providers }),
    ],
  });
}
