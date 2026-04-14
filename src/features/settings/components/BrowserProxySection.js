/** Jaskier Shared Pattern — Browser Proxy Login Section (Settings) */
import { useViewTheme } from '@jaskier/chat-module';
import { Badge, Button, cn } from '@jaskier/ui';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AlertTriangle from '~icons/lucide/alert-triangle';
import CheckCircle from '~icons/lucide/check-circle';
import Globe from '~icons/lucide/globe';
import Loader2 from '~icons/lucide/loader-2';
import LogIn from '~icons/lucide/log-in';
import LogOut from '~icons/lucide/log-out';
import Power from '~icons/lucide/power';
import RefreshCw from '~icons/lucide/refresh-cw';
import {
  useBrowserProxyLogin,
  useBrowserProxyLogout,
  useBrowserProxyReinit,
  useBrowserProxyStatus,
} from '../hooks/useBrowserProxy';

const phaseVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};
function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
function formatAge(t, seconds) {
  if (seconds == null) return t('settings.browserProxy.unknown');
  if (seconds < 60)
    return t('settings.browserProxy.secondsAgo', { count: seconds });
  if (seconds < 3600)
    return t('settings.browserProxy.minutesAgo', {
      count: Math.floor(seconds / 60),
    });
  if (seconds < 86400)
    return t('settings.browserProxy.hoursAgo', {
      count: Math.floor(seconds / 3600),
    });
  return t('settings.browserProxy.daysAgo', {
    count: Math.floor(seconds / 86400),
  });
}
export const BrowserProxySection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const [polling, setPolling] = useState(false);
  const { data: status, isLoading } = useBrowserProxyStatus(polling);
  const loginMutation = useBrowserProxyLogin();
  const reinitMutation = useBrowserProxyReinit();
  const logoutMutation = useBrowserProxyLogout();
  const loginInProgress = status?.login?.login_in_progress ?? false;
  // Auto-poll during login
  useEffect(() => {
    if (loginInProgress) {
      setPolling(true);
    } else if (polling) {
      // Stop polling 2s after login completes
      const timer = setTimeout(() => setPolling(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [loginInProgress, polling]);
  const handleLogin = useCallback(async () => {
    try {
      setPolling(true);
      await loginMutation.mutateAsync();
      toast.success(t('settings.browserProxy.loginStarted'));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('settings.browserProxy.loginFailed'),
      );
    }
  }, [loginMutation, t]);
  const handleReinit = useCallback(async () => {
    try {
      await reinitMutation.mutateAsync();
      toast.success(t('settings.browserProxy.reinitSuccess'));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('settings.browserProxy.reinitFailed'),
      );
    }
  }, [reinitMutation, t]);
  const handleLogout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
      toast.success(t('settings.browserProxy.logoutSuccess'));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('settings.browserProxy.logoutFailed'),
      );
    }
  }, [logoutMutation, t]);
  // Determine display state
  const configured = status?.configured ?? false;
  const reachable = status?.reachable ?? false;
  const loggedIn = status?.health?.logged_in ?? false;
  const ready = status?.health?.ready ?? false;
  const workersReady = status?.health?.workers_ready ?? 0;
  const poolSize = status?.health?.pool_size ?? 0;
  const phase = !configured
    ? 'not_configured'
    : !reachable
      ? 'unreachable'
      : loginInProgress
        ? 'logging_in'
        : !loggedIn
          ? 'not_logged_in'
          : 'connected';
  return _jsxs('div', {
    className: 'space-y-4',
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          _jsx(Globe, {
            width: 18,
            height: 18,
            className: 'text-[var(--matrix-accent)]',
          }),
          _jsx('h3', {
            className: cn(
              'text-sm font-semibold font-mono uppercase tracking-wider',
              theme.text,
            ),
            children: t('settings.browserProxy.title'),
          }),
        ],
      }),
      _jsx('p', {
        className: cn('text-xs', theme.textMuted),
        children: t('settings.browserProxy.description'),
      }),
      isLoading
        ? _jsxs('div', {
            className: 'flex items-center gap-2',
            children: [
              _jsx(Loader2, {
                width: 14,
                height: 14,
                className: 'animate-spin text-[var(--matrix-accent)]',
              }),
              _jsx('span', {
                className: cn('text-xs', theme.textMuted),
                children: t('settings.browserProxy.checking'),
              }),
            ],
          })
        : _jsxs(AnimatePresence, {
            mode: 'wait',
            children: [
              phase === 'not_configured' &&
                _jsxs(
                  motion.div,
                  {
                    ...phaseVariants,
                    className: 'space-y-2',
                    children: [
                      _jsxs('div', {
                        className: 'flex items-center gap-2 text-zinc-500',
                        children: [
                          _jsx(Power, { width: 14, height: 14 }),
                          _jsx('span', {
                            className: 'text-xs font-mono',
                            children: t('settings.browserProxy.notConfigured'),
                          }),
                        ],
                      }),
                      _jsx('p', {
                        className: cn('text-xs', theme.textMuted),
                        children: t('settings.browserProxy.notConfiguredHint')
                          .split('<code>')
                          .map((part, i) => {
                            if (i === 0) return part;
                            const [code, rest] = part.split('</code>');
                            return _jsxs(
                              'span',
                              {
                                children: [
                                  _jsx('code', {
                                    className: 'text-[var(--matrix-accent)]',
                                    children: code,
                                  }),
                                  rest,
                                ],
                              },
                              code,
                            );
                          }),
                      }),
                    ],
                  },
                  'not-configured',
                ),
              phase === 'unreachable' &&
                _jsxs(
                  motion.div,
                  {
                    ...phaseVariants,
                    className: 'space-y-2',
                    children: [
                      _jsxs('div', {
                        className: 'flex items-center gap-2 text-red-400',
                        children: [
                          _jsx(AlertTriangle, { width: 14, height: 14 }),
                          _jsx('span', {
                            className: 'text-xs font-mono',
                            children: t('settings.browserProxy.unreachable'),
                          }),
                        ],
                      }),
                      _jsx('p', {
                        className: cn('text-xs', theme.textMuted),
                        children: t('settings.browserProxy.unreachableHint', {
                          url: status?.proxy_url,
                        })
                          .split('<code>')
                          .map((part, i) => {
                            if (i === 0) return part;
                            const [code, rest] = part.split('</code>');
                            return _jsxs(
                              'span',
                              {
                                children: [
                                  _jsx('code', {
                                    className: 'text-[var(--matrix-accent)]',
                                    children: code,
                                  }),
                                  rest,
                                ],
                              },
                              code,
                            );
                          }),
                      }),
                    ],
                  },
                  'unreachable',
                ),
              phase === 'logging_in' &&
                _jsxs(
                  motion.div,
                  {
                    ...phaseVariants,
                    className: 'space-y-3',
                    children: [
                      _jsxs('div', {
                        className: 'flex items-center gap-2 text-amber-400',
                        children: [
                          _jsx(Loader2, {
                            width: 14,
                            height: 14,
                            className: 'animate-spin',
                          }),
                          _jsx('span', {
                            className: 'text-xs font-mono font-medium',
                            children: t('settings.browserProxy.loggingIn'),
                          }),
                        ],
                      }),
                      _jsx('p', {
                        className: cn('text-xs', theme.textMuted),
                        children: t('settings.browserProxy.loggingInHint'),
                      }),
                      status?.login?.last_login_error &&
                        _jsxs('div', {
                          className: 'flex items-center gap-2 text-red-400',
                          children: [
                            _jsx(AlertTriangle, { width: 14, height: 14 }),
                            _jsx('span', {
                              className: 'text-xs',
                              children: status.login.last_login_error,
                            }),
                          ],
                        }),
                    ],
                  },
                  'logging-in',
                ),
              phase === 'not_logged_in' &&
                _jsxs(
                  motion.div,
                  {
                    ...phaseVariants,
                    className: 'space-y-3',
                    children: [
                      _jsxs('div', {
                        className: 'flex items-center gap-2 text-amber-400',
                        children: [
                          _jsx(AlertTriangle, { width: 14, height: 14 }),
                          _jsx('span', {
                            className: 'text-xs font-mono',
                            children: t('settings.browserProxy.notLoggedIn'),
                          }),
                        ],
                      }),
                      _jsx('p', {
                        className: cn('text-xs', theme.textMuted),
                        children: t('settings.browserProxy.notLoggedInHint'),
                      }),
                      status?.login?.last_login_error &&
                        _jsxs('div', {
                          className:
                            'flex items-center gap-2 text-red-400 mt-1',
                          children: [
                            _jsx(AlertTriangle, { width: 14, height: 14 }),
                            _jsx('span', {
                              className: 'text-xs',
                              children: status.login.last_login_error,
                            }),
                          ],
                        }),
                      _jsx(Button, {
                        variant: 'primary',
                        size: 'sm',
                        leftIcon: _jsx(LogIn, { width: 14, height: 14 }),
                        onClick: handleLogin,
                        isLoading: loginMutation.isPending,
                        children: t('settings.browserProxy.loginToGoogle'),
                      }),
                    ],
                  },
                  'not-logged-in',
                ),
              phase === 'connected' &&
                _jsxs(
                  motion.div,
                  {
                    ...phaseVariants,
                    className: 'space-y-3',
                    children: [
                      _jsxs('div', {
                        className: 'flex items-center gap-3 flex-wrap',
                        children: [
                          _jsx(Badge, {
                            variant: 'accent',
                            size: 'sm',
                            icon: _jsx(CheckCircle, { width: 12, height: 12 }),
                            children: ready
                              ? t('settings.browserProxy.ready')
                              : t('settings.browserProxy.loggedIn'),
                          }),
                          _jsx('span', {
                            className: cn('text-xs font-mono', theme.textMuted),
                            children: t('settings.browserProxy.workers', {
                              ready: workersReady,
                              total: poolSize,
                            }),
                          }),
                        ],
                      }),
                      _jsxs('div', {
                        className: 'grid grid-cols-3 gap-2',
                        children: [
                          _jsx(StatItem, {
                            label: t('settings.browserProxy.uptime'),
                            value: formatUptime(
                              status?.health?.uptime_seconds ?? 0,
                            ),
                            theme: theme,
                          }),
                          _jsx(StatItem, {
                            label: t('settings.browserProxy.requests'),
                            value: String(status?.health?.total_requests ?? 0),
                            theme: theme,
                          }),
                          _jsx(StatItem, {
                            label: t('settings.browserProxy.authAge'),
                            value: formatAge(
                              t,
                              status?.login?.auth_file_age_seconds,
                            ),
                            theme: theme,
                          }),
                        ],
                      }),
                      (status?.health?.total_errors ?? 0) > 0 &&
                        _jsxs('div', {
                          className: 'flex items-center gap-2 text-amber-400',
                          children: [
                            _jsx(AlertTriangle, { width: 12, height: 12 }),
                            _jsx('span', {
                              className: 'text-[10px] font-mono',
                              children: t('settings.browserProxy.errors', {
                                count: status?.health?.total_errors,
                              }),
                            }),
                          ],
                        }),
                      _jsxs('div', {
                        className: 'flex items-center gap-2 pt-1',
                        children: [
                          _jsx(Button, {
                            variant: 'ghost',
                            size: 'sm',
                            leftIcon: _jsx(RefreshCw, {
                              width: 14,
                              height: 14,
                            }),
                            onClick: handleReinit,
                            isLoading: reinitMutation.isPending,
                            children: t('settings.browserProxy.reinitWorkers'),
                          }),
                          _jsx(Button, {
                            variant: 'danger',
                            size: 'sm',
                            leftIcon: _jsx(LogOut, { width: 14, height: 14 }),
                            onClick: handleLogout,
                            isLoading: logoutMutation.isPending,
                            children: t('settings.browserProxy.logout'),
                          }),
                        ],
                      }),
                    ],
                  },
                  'connected',
                ),
            ],
          }),
    ],
  });
});
BrowserProxySection.displayName = 'BrowserProxySection';
// -- Small stat item --
const StatItem = memo(({ label, value, theme }) =>
  _jsxs('div', {
    className: 'rounded-lg bg-[var(--matrix-glass)] px-2.5 py-1.5',
    children: [
      _jsx('div', {
        className: cn('text-[10px] font-mono', theme.textMuted),
        children: label,
      }),
      _jsx('div', {
        className: 'text-xs font-mono font-medium text-[var(--matrix-accent)]',
        children: value,
      }),
    ],
  }),
);
StatItem.displayName = 'StatItem';
