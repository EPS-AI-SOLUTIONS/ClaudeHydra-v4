// src/features/logs/components/LogsView.tsx
import { useViewTheme } from '@jaskier/chat-module';
import { Button, Card, cn, Input } from '@jaskier/ui';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { memo, useCallback, useState } from 'react';
import {
  Fragment as _Fragment,
  jsx as _jsx,
  jsxs as _jsxs,
} from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Copy from '~icons/lucide/copy';
import RefreshCw from '~icons/lucide/refresh-cw';
import ScrollText from '~icons/lucide/scroll-text';
import Search from '~icons/lucide/search';
import Trash2 from '~icons/lucide/trash-2';
import { clearBackendLogs, useBackendLogs } from '../hooks/useLogs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function levelBadgeClasses(level, isLight) {
  const l = level.toUpperCase();
  if (l === 'ERROR')
    return isLight ? 'bg-red-100 text-red-700' : 'bg-red-500/15 text-red-400';
  if (l === 'WARN')
    return isLight
      ? 'bg-amber-100 text-amber-700'
      : 'bg-amber-500/15 text-amber-400';
  if (l === 'INFO')
    return isLight
      ? 'bg-blue-100 text-blue-700'
      : 'bg-blue-500/15 text-blue-400';
  return isLight ? 'bg-gray-100 text-gray-600' : 'bg-white/5 text-white/40';
}
function formatTimestamp(ts) {
  try {
    const d = new Date(ts);
    return (
      d.toLocaleTimeString('en-GB', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0')
    );
  } catch {
    return ts;
  }
}
const LOG_TABS = [
  { key: 'backend', i18nKey: 'logs.tab.backend' },
  { key: 'audit', i18nKey: 'logs.tab.audit' },
  { key: 'flyio', i18nKey: 'logs.tab.flyio' },
  { key: 'activity', i18nKey: 'logs.tab.activity' },
];
export const LogsView = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState('backend');
  const { data, isLoading, isError, refetch } = useBackendLogs(
    { limit: 200, level: level || undefined, search: search || undefined },
    autoRefresh,
  );
  const logs = data?.logs ?? [];
  const handleCopy = useCallback(async () => {
    if (!logs.length) {
      toast.error(t('logs.nothingToCopy', 'Nothing to copy'));
      return;
    }
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.level}] ${l.target}: ${l.message}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    toast.success(t('logs.copied', 'Copied to clipboard'));
  }, [logs, t]);
  const handleClear = useCallback(async () => {
    try {
      await clearBackendLogs();
      queryClient.invalidateQueries({ queryKey: ['logs-backend'] });
      toast.success(t('logs.cleared', 'Logs cleared'));
    } catch {
      toast.error(t('logs.clearError', 'Failed to clear logs'));
    }
  }, [queryClient, t]);
  return _jsx('div', {
    className: 'h-full flex flex-col items-center p-8 overflow-y-auto',
    children: _jsxs(motion.div, {
      className: 'w-full max-w-5xl space-y-6',
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, ease: 'easeOut' },
      children: [
        _jsxs('div', {
          className: 'flex items-center gap-3',
          children: [
            _jsx(ScrollText, {
              width: 22,
              height: 22,
              className: 'text-[var(--matrix-accent)]',
            }),
            _jsx('h1', {
              className: cn(
                'text-2xl font-bold font-mono tracking-tight',
                theme.title,
              ),
              children: t('logs.title', 'Logs'),
            }),
            _jsxs('div', {
              className: 'ml-auto flex items-center gap-2',
              children: [
                _jsx(Button, {
                  variant: 'ghost',
                  size: 'sm',
                  onClick: handleCopy,
                  leftIcon: _jsx(Copy, { width: 14, height: 14 }),
                  children: t('logs.copy', 'Copy'),
                }),
                _jsx(Button, {
                  variant: 'ghost',
                  size: 'sm',
                  onClick: () => void handleClear(),
                  leftIcon: _jsx(Trash2, { width: 14, height: 14 }),
                  children: t('logs.clear', 'Clear'),
                }),
              ],
            }),
          ],
        }),
        _jsx(Card, {
          children: _jsxs('div', {
            className: 'space-y-3',
            children: [
              _jsxs('div', {
                className: 'flex items-center gap-2 flex-wrap',
                children: [
                  _jsx('div', {
                    className: 'flex-1 min-w-[200px]',
                    children: _jsx(Input, {
                      inputSize: 'sm',
                      placeholder: t(
                        'logs.searchPlaceholder',
                        'Search logs...',
                      ),
                      icon: _jsx(Search, { width: 14, height: 14 }),
                      value: search,
                      onChange: (e) => setSearch(e.target.value),
                    }),
                  }),
                  _jsxs('select', {
                    value: level,
                    onChange: (e) => setLevel(e.target.value),
                    className: cn(
                      'glass-input rounded-lg font-mono text-xs px-2.5 py-1.5 outline-none',
                      'text-[var(--matrix-text-primary)]',
                    ),
                    'aria-label': t('logs.levelFilter', 'Filter by level'),
                    children: [
                      _jsx('option', {
                        value: '',
                        children: t('logs.allLevels', 'All levels'),
                      }),
                      _jsx('option', { value: 'ERROR', children: 'ERROR' }),
                      _jsx('option', { value: 'WARN', children: 'WARN' }),
                      _jsx('option', { value: 'INFO', children: 'INFO' }),
                      _jsx('option', { value: 'DEBUG', children: 'DEBUG' }),
                      _jsx('option', { value: 'TRACE', children: 'TRACE' }),
                    ],
                  }),
                  _jsx(Button, {
                    variant: autoRefresh ? 'secondary' : 'ghost',
                    size: 'sm',
                    onClick: () => setAutoRefresh(!autoRefresh),
                    leftIcon: _jsx(RefreshCw, {
                      width: 14,
                      height: 14,
                      className: autoRefresh ? 'animate-spin' : '',
                    }),
                    children: autoRefresh
                      ? t('logs.autoRefreshOn', 'Live')
                      : t('logs.autoRefreshOff', 'Paused'),
                  }),
                  _jsx(Button, {
                    variant: 'ghost',
                    size: 'sm',
                    onClick: () => void refetch(),
                    leftIcon: _jsx(RefreshCw, { width: 14, height: 14 }),
                    children: t('logs.refresh', 'Refresh'),
                  }),
                ],
              }),
              _jsx('div', {
                className: 'flex gap-1 border-b border-white/10',
                children: LOG_TABS.map((tab) =>
                  _jsx(
                    'button',
                    {
                      type: 'button',
                      onClick: () => setActiveTab(tab.key),
                      className: cn(
                        'px-3 py-1.5 text-xs font-mono rounded-t-lg transition-colors',
                        activeTab === tab.key
                          ? 'bg-[var(--matrix-accent)]/10 text-[var(--matrix-accent)] border border-b-0 border-[var(--matrix-accent)]/30'
                          : 'text-[var(--matrix-text-secondary)] hover:bg-white/5',
                      ),
                      children: t(tab.i18nKey, tab.key),
                    },
                    tab.key,
                  ),
                ),
              }),
              activeTab === 'backend' &&
                _jsxs(_Fragment, {
                  children: [
                    isLoading &&
                      _jsx('p', {
                        className:
                          'text-sm text-[var(--matrix-text-secondary)] text-center py-8',
                        children: t('common.loading', 'Loading...'),
                      }),
                    isError &&
                      _jsx('p', {
                        className: 'text-sm text-red-400 text-center py-8',
                        children: t('common.loadError', 'Failed to load data'),
                      }),
                    !isLoading &&
                      !isError &&
                      logs.length === 0 &&
                      _jsx('p', {
                        className:
                          'text-sm text-[var(--matrix-text-secondary)] text-center py-8',
                        children: t('logs.empty', 'No log entries'),
                      }),
                    logs.length > 0 &&
                      _jsx('div', {
                        className: 'space-y-0.5 max-h-[65vh] overflow-y-auto',
                        children: logs.map((entry, i) =>
                          _jsxs(
                            'div',
                            {
                              className: cn(
                                'flex items-start gap-3 px-3 py-2 rounded-lg transition-colors',
                                theme.isLight
                                  ? 'hover:bg-black/[0.03]'
                                  : 'hover:bg-white/[0.03]',
                              ),
                              children: [
                                _jsx('span', {
                                  className:
                                    'font-mono text-xs text-[var(--matrix-text-secondary)] shrink-0 pt-0.5 w-20',
                                  children: formatTimestamp(entry.timestamp),
                                }),
                                _jsx('span', {
                                  className: cn(
                                    'inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase shrink-0 w-14 text-center',
                                    levelBadgeClasses(
                                      entry.level,
                                      theme.isLight,
                                    ),
                                  ),
                                  children: entry.level,
                                }),
                                _jsx('span', {
                                  className:
                                    'font-mono text-xs text-[var(--matrix-text-secondary)] shrink-0 w-32 truncate pt-0.5',
                                  children: entry.target,
                                }),
                                _jsx('span', {
                                  className:
                                    'font-mono text-xs text-[var(--matrix-text-primary)] flex-1 break-all',
                                  children: entry.message,
                                }),
                              ],
                            },
                            `${entry.timestamp}-${i}`,
                          ),
                        ),
                      }),
                  ],
                }),
              activeTab === 'audit' &&
                _jsx('p', {
                  className:
                    'text-sm font-mono text-center py-8 text-[var(--matrix-text-secondary)]',
                  children: 'Audit logs \u2014 coming soon',
                }),
              activeTab === 'flyio' &&
                _jsx('p', {
                  className:
                    'text-sm font-mono text-center py-8 text-[var(--matrix-text-secondary)]',
                  children: 'Fly.io logs \u2014 coming soon',
                }),
              activeTab === 'activity' &&
                _jsx('p', {
                  className:
                    'text-sm font-mono text-center py-8 text-[var(--matrix-text-secondary)]',
                  children: 'Activity logs \u2014 coming soon',
                }),
            ],
          }),
        }),
      ],
    }),
  });
});
LogsView.displayName = 'LogsView';
export default LogsView;
