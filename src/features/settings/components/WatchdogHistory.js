// src/features/settings/components/WatchdogHistory.tsx
/**
 * Watchdog History — shows browser proxy health events from the ring buffer.
 */
import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { apiGet } from '@/shared/api/client';
import Activity from '~icons/lucide/activity';
import AlertTriangle from '~icons/lucide/alert-triangle';
import CheckCircle from '~icons/lucide/check-circle';
import RefreshCw from '~icons/lucide/refresh-cw';
import WifiOff from '~icons/lucide/wifi-off';

const eventConfig = {
  online: { icon: CheckCircle, color: 'text-emerald-400', label: 'Online' },
  unreachable: { icon: WifiOff, color: 'text-red-400', label: 'Unreachable' },
  not_ready: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    label: 'Not Ready',
  },
  restart_initiated: {
    icon: RefreshCw,
    color: 'text-blue-400',
    label: 'Restart',
  },
};
const defaultEvent = { icon: Activity, color: 'text-zinc-400', label: 'Event' };
function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}
function formatDate(iso) {
  try {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Dzisiaj';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Wczoraj';
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}
export const WatchdogHistory = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data, isLoading } = useQuery({
    queryKey: ['browser-proxy-history'],
    queryFn: () => apiGet('/api/browser-proxy/history'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
  const events = data?.events ?? [];
  return _jsxs('div', {
    className: 'space-y-4',
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          _jsx(Activity, {
            width: 18,
            height: 18,
            className: 'text-[var(--matrix-accent)]',
          }),
          _jsx('h3', {
            className: cn(
              'text-sm font-semibold font-mono uppercase tracking-wider',
              theme.text,
            ),
            children: t('settings.watchdog.title'),
          }),
        ],
      }),
      _jsx('p', {
        className: cn('text-xs', theme.textMuted),
        children: t('settings.watchdog.description'),
      }),
      isLoading
        ? _jsx('div', {
            className: cn('text-xs font-mono', theme.textMuted),
            children: t('common.loading'),
          })
        : events.length === 0
          ? _jsx('div', {
              className: cn(
                'text-xs font-mono py-4 text-center',
                theme.textMuted,
              ),
              children: t('settings.watchdog.noEvents'),
            })
          : _jsx('div', {
              className: 'space-y-1 max-h-64 overflow-y-auto scrollbar-hide',
              children: events.map((evt) => {
                const cfg = eventConfig[evt.event_type] ?? defaultEvent;
                const Icon = cfg.icon;
                const workerInfo = `${evt.workers_ready}/${evt.pool_size}`;
                return _jsxs(
                  'div',
                  {
                    className: cn(
                      'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-mono',
                      theme.isLight ? 'hover:bg-black/5' : 'hover:bg-white/5',
                    ),
                    children: [
                      _jsx(Icon, {
                        width: 13,
                        height: 13,
                        className: cn('shrink-0', cfg.color),
                      }),
                      _jsx('span', {
                        className: cn('w-16 shrink-0', theme.textMuted),
                        children: formatTime(evt.timestamp),
                      }),
                      _jsx('span', {
                        className: cn(
                          'w-12 shrink-0 text-[10px]',
                          theme.textMuted,
                        ),
                        children: formatDate(evt.timestamp),
                      }),
                      _jsx('span', {
                        className: cn('font-medium', cfg.color),
                        children: cfg.label,
                      }),
                      _jsx('span', {
                        className: cn('shrink-0', theme.textMuted),
                        children: workerInfo,
                      }),
                      evt.error &&
                        _jsx('span', {
                          className: cn('truncate', theme.textMuted),
                          title: evt.error,
                          children: evt.error,
                        }),
                    ],
                  },
                  `${evt.timestamp}-${evt.event_type}`,
                );
              }),
            }),
    ],
  });
});
WatchdogHistory.displayName = 'WatchdogHistory';
