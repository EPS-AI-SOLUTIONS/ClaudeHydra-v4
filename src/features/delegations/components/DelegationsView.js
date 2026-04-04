// src/features/delegations/components/DelegationsView.tsx
import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { Activity, AlertTriangle, CheckCircle2, Clock, Loader2, Network, RefreshCw, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { useDelegations } from '../hooks/useDelegations';

const TIER_COLORS = {
  commander: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  coordinator: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  executor: 'text-green-400 bg-green-500/10 border-green-500/30',
};
const STATUS_ICONS = {
  completed: CheckCircle2,
  working: Loader2,
  error: AlertTriangle,
};
function formatDuration(ms) {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
function TaskRow({ task, theme }) {
  const [expanded, setExpanded] = useState(false);
  const tierClass = TIER_COLORS[task.agent_tier] || TIER_COLORS['executor'];
  const StatusIcon = STATUS_ICONS[task.status] || Activity;
  const isWorking = task.status === 'working';
  const isError = task.is_error;
  return _jsxs(motion.div, {
    layout: true,
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    className: cn(
      'border rounded-lg p-3 transition-colors cursor-pointer',
      isError
        ? 'border-red-500/30 bg-red-500/5'
        : isWorking
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-[var(--matrix-border)] bg-[var(--matrix-bg-secondary)]',
      'hover:bg-[var(--matrix-bg-tertiary)]',
      task.call_depth > 1 && 'ml-6 border-l-2 border-l-[var(--matrix-accent)]',
    ),
    onClick: () => setExpanded(!expanded),
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-3',
        children: [
          _jsx(StatusIcon, {
            size: 16,
            className: cn(isError ? 'text-red-400' : isWorking ? 'text-amber-400 animate-spin' : 'text-emerald-400'),
          }),
          _jsx('span', {
            className: cn('px-2 py-0.5 text-xs font-bold rounded border', tierClass),
            children: task.agent_tier.toUpperCase(),
          }),
          _jsx('span', {
            className: cn('font-medium text-sm', 'text-[var(--matrix-text-primary)]'),
            children: task.agent_name,
          }),
          _jsx('span', { className: cn('text-xs ml-auto', theme.textMuted), children: timeAgo(task.created_at) }),
          _jsx('span', {
            className: cn('text-xs tabular-nums', theme.textMuted),
            children: formatDuration(task.duration_ms),
          }),
          _jsxs('span', { className: 'text-xs text-[var(--matrix-text-secondary)]', children: ['d', task.call_depth] }),
        ],
      }),
      _jsx('p', { className: cn('text-xs mt-1.5 truncate', theme.textMuted), children: task.task_prompt }),
      _jsx(AnimatePresence, {
        children:
          expanded &&
          _jsx(motion.div, {
            initial: { height: 0, opacity: 0 },
            animate: { height: 'auto', opacity: 1 },
            exit: { height: 0, opacity: 0 },
            className: 'overflow-hidden',
            children: _jsxs('div', {
              className: cn('mt-2 pt-2 border-t border-[var(--matrix-border)] text-xs space-y-1', theme.textMuted),
              children: [
                _jsxs('p', { children: [_jsx('strong', { children: 'Model:' }), ' ', task.model_used] }),
                _jsxs('p', { children: [_jsx('strong', { children: 'Status:' }), ' ', task.status] }),
                _jsxs('p', {
                  className: 'break-all',
                  children: [_jsx('strong', { children: 'Task:' }), ' ', task.task_prompt],
                }),
                task.result_preview &&
                  _jsxs('p', {
                    className: 'break-all',
                    children: [_jsx('strong', { children: 'Result:' }), ' ', task.result_preview],
                  }),
              ],
            }),
          }),
      }),
    ],
  });
}
const TIERS = ['all', 'commander', 'coordinator', 'executor'];
const STATUSES = ['all', 'working', 'completed', 'failed'];
function DelegationsView() {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [tierFilter, setTierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const { data, isLoading, isError, refetch } = useDelegations(autoRefresh);
  const allTasks = data?.tasks ?? [];
  const stats = data?.stats ?? { total: 0, completed: 0, errors: 0, avg_duration_ms: null };
  const tasks = allTasks.filter((task) => {
    if (tierFilter !== 'all' && task.agent_tier !== tierFilter) return false;
    if (statusFilter !== 'all') {
      if (statusFilter === 'failed') return task.is_error;
      if (statusFilter === 'working') return task.status === 'working';
      if (statusFilter === 'completed') return task.status === 'completed' && !task.is_error;
    }
    return true;
  });
  return _jsxs('div', {
    className: 'h-full flex flex-col p-4 gap-4 overflow-y-auto',
    children: [
      _jsxs('div', {
        className: 'flex items-center justify-between flex-wrap gap-2',
        children: [
          _jsxs('div', {
            className: 'flex items-center gap-3',
            children: [
              _jsx(Network, { size: 20, className: 'text-[var(--matrix-accent)]' }),
              _jsx('h1', {
                className: cn('text-lg font-bold', 'text-[var(--matrix-text-primary)]'),
                children: t('delegations.title', 'Agent Delegations'),
              }),
            ],
          }),
          _jsxs('div', {
            className: 'flex items-center gap-2',
            children: [
              _jsx('select', {
                value: tierFilter,
                onChange: (e) => setTierFilter(e.target.value),
                className:
                  'px-2 py-1 rounded text-xs bg-[var(--matrix-bg-secondary)] border border-[var(--matrix-border)] text-[var(--matrix-text-primary)]',
                children: TIERS.map((tier) =>
                  _jsx(
                    'option',
                    {
                      value: tier,
                      children:
                        tier === 'all'
                          ? t('delegations.allTiers', 'All Tiers')
                          : tier.charAt(0).toUpperCase() + tier.slice(1),
                    },
                    tier,
                  ),
                ),
              }),
              _jsx('select', {
                value: statusFilter,
                onChange: (e) => setStatusFilter(e.target.value),
                className:
                  'px-2 py-1 rounded text-xs bg-[var(--matrix-bg-secondary)] border border-[var(--matrix-border)] text-[var(--matrix-text-primary)]',
                children: STATUSES.map((status) =>
                  _jsx(
                    'option',
                    {
                      value: status,
                      children:
                        status === 'all'
                          ? t('delegations.allStatuses', 'All Statuses')
                          : status.charAt(0).toUpperCase() + status.slice(1),
                    },
                    status,
                  ),
                ),
              }),
              _jsx('button', {
                type: 'button',
                onClick: () => setAutoRefresh(!autoRefresh),
                className: cn(
                  'px-3 py-1 rounded text-xs font-medium transition-colors',
                  autoRefresh
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-[var(--matrix-bg-secondary)] text-[var(--matrix-text-secondary)] border border-[var(--matrix-border)]',
                ),
                children: autoRefresh ? t('logs.autoRefreshOn', 'Live') : t('logs.autoRefreshOff', 'Paused'),
              }),
              _jsx('button', {
                type: 'button',
                onClick: () => refetch(),
                className:
                  'p-1.5 rounded text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-accent)] transition-colors',
                title: 'Refresh',
                children: _jsx(RefreshCw, { size: 16 }),
              }),
            ],
          }),
        ],
      }),
      _jsx('div', {
        className: 'grid grid-cols-2 sm:grid-cols-4 gap-3',
        children: [
          { label: t('delegations.total', 'Total'), value: stats.total, icon: Users, color: 'text-blue-400' },
          {
            label: t('delegations.completed', 'Completed'),
            value: stats.completed,
            icon: CheckCircle2,
            color: 'text-emerald-400',
          },
          { label: t('delegations.errors', 'Errors'), value: stats.errors, icon: AlertTriangle, color: 'text-red-400' },
          {
            label: t('delegations.avgDuration', 'Avg Duration'),
            value: formatDuration(stats.avg_duration_ms),
            icon: Clock,
            color: 'text-amber-400',
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return _jsxs(
            'div',
            {
              className: cn('rounded-lg border border-[var(--matrix-border)] bg-[var(--matrix-bg-secondary)] p-3'),
              children: [
                _jsxs('div', {
                  className: 'flex items-center gap-2 mb-1',
                  children: [
                    _jsx(Icon, { size: 14, className: stat.color }),
                    _jsx('span', { className: cn('text-xs', theme.textMuted), children: stat.label }),
                  ],
                }),
                _jsx('p', {
                  className: cn('text-xl font-bold tabular-nums', 'text-[var(--matrix-text-primary)]'),
                  children: stat.value,
                }),
              ],
            },
            stat.label,
          );
        }),
      }),
      isLoading &&
        _jsx('div', {
          className: 'flex items-center justify-center py-12',
          children: _jsx(Loader2, { size: 24, className: 'animate-spin text-[var(--matrix-accent)]' }),
        }),
      isError &&
        _jsx('div', {
          className: cn('text-center py-8 text-sm', theme.textMuted),
          children: t('common.loadError', 'Failed to load data'),
        }),
      !isLoading &&
        !isError &&
        tasks.length === 0 &&
        _jsx('div', {
          className: cn('text-center py-12 text-sm', theme.textMuted),
          children: t(
            'delegations.empty',
            'No delegations yet. Agents will delegate subtasks automatically during complex conversations.',
          ),
        }),
      !isLoading &&
        !isError &&
        tasks.length > 0 &&
        _jsx('div', {
          className: 'space-y-2',
          children: tasks.map((task) => _jsx(TaskRow, { task: task, theme: theme }, task.id)),
        }),
    ],
  });
}
export default memo(DelegationsView);
