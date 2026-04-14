/** Jaskier Shared Pattern */
// src/features/health/components/HealthDashboard.tsx
/**
 * ClaudeHydra v4 - Health Dashboard
 * ===================================
 * Compact grid of stat cards showing backend status, auth mode,
 * system resources, model cache size, and uptime.
 */
import { useViewTheme } from '@jaskier/chat-module';
import { QueryError } from '@jaskier/hydra-app/components/molecules';
import { BaseMetricsDashboard, Card, cn } from '@jaskier/ui';
import { memo, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import Clock from '~icons/lucide/clock';
import RefreshCw from '~icons/lucide/refresh-cw';
import Shield from '~icons/lucide/shield';
import { useHealthDashboard } from '../hooks/useHealthDashboard';

// ============================================================================
// HELPERS
// ============================================================================
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${String(h)}h ${String(m)}m`;
  return `${String(m)}m`;
}
function formatMemory(usedMb, totalMb) {
  return `${String(Math.round(usedMb))} / ${String(Math.round(totalMb))} MB`;
}
const StatCard = memo(({ icon, label, value, statusColor }) => {
  const theme = useViewTheme();
  return _jsxs(Card, {
    variant: 'default',
    padding: 'sm',
    className: 'flex items-center gap-3 min-w-0',
    children: [
      _jsx('div', {
        className: cn('shrink-0', theme.iconMuted),
        children: icon,
      }),
      _jsxs('div', {
        className: 'flex-1 min-w-0',
        children: [
          _jsx('p', {
            className: cn(
              'text-[10px] uppercase tracking-wider font-mono',
              theme.textMuted,
            ),
            children: label,
          }),
          _jsx('p', {
            className: cn(
              'text-sm font-mono font-semibold truncate',
              statusColor ?? theme.text,
            ),
            children: value,
          }),
        ],
      }),
    ],
  });
});
StatCard.displayName = 'StatCard';
// ============================================================================
// HEALTH DASHBOARD
// ============================================================================
export const HealthDashboard = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const data = useHealthDashboard();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = () => {
    setIsRefreshing(true);
    data.refetch();
    setTimeout(() => setIsRefreshing(false), 1000);
  };
  if (data.loading) {
    return _jsxs('div', {
      className: 'w-full',
      children: [
        _jsx('h3', {
          className: cn(
            'text-sm font-mono font-semibold uppercase tracking-wider mb-3',
            theme.textMuted,
          ),
          children: t('health.title', 'System Health'),
        }),
        _jsx('div', {
          className: cn('text-sm font-mono animate-pulse', theme.textMuted),
          children: t('common.loading', 'Loading...'),
        }),
      ],
    });
  }
  if (data.error) {
    return _jsxs('div', {
      className: 'w-full',
      children: [
        _jsx('h3', {
          className: cn(
            'text-sm font-mono font-semibold uppercase tracking-wider mb-3',
            theme.textMuted,
          ),
          children: t('health.title', 'System Health'),
        }),
        _jsx(QueryError, { onRetry: data.refetch }),
      ],
    });
  }
  const memoryPercent =
    data.memoryTotalMb && data.memoryTotalMb > 0
      ? ((data.memoryUsedMb ?? 0) / data.memoryTotalMb) * 100
      : 0;
  return _jsxs('div', {
    className: 'w-full flex flex-col gap-4',
    children: [
      _jsxs('div', {
        className: 'flex items-center justify-between',
        children: [
          _jsx('h3', {
            className: cn(
              'text-sm font-mono font-semibold uppercase tracking-wider',
              theme.textMuted,
            ),
            children: t('health.title', 'System Health'),
          }),
          _jsx('button', {
            type: 'button',
            onClick: handleRefresh,
            className: cn('p-1.5 rounded-lg transition-all', theme.btnGhost),
            'aria-label': t('health.refresh', 'Refresh health data'),
            title: t('health.refresh', 'Refresh'),
            children: _jsx(RefreshCw, {
              width: 14,
              height: 14,
              className: isRefreshing ? 'animate-spin' : '',
            }),
          }),
        ],
      }),
      _jsx(BaseMetricsDashboard, {
        title: t('health.metrics', 'System Metrics'),
        cpu:
          data.cpuUsage !== null
            ? {
                label: 'CPU',
                value: data.cpuUsage,
                status:
                  data.cpuUsage > 90
                    ? 'error'
                    : data.cpuUsage > 70
                      ? 'warning'
                      : 'success',
              }
            : undefined,
        ram:
          data.memoryUsedMb !== null && data.memoryTotalMb !== null
            ? {
                label: 'RAM',
                value: memoryPercent,
                displayValue: formatMemory(
                  data.memoryUsedMb,
                  data.memoryTotalMb,
                ),
                status:
                  memoryPercent > 90
                    ? 'error'
                    : memoryPercent > 75
                      ? 'warning'
                      : 'success',
              }
            : undefined,
        network: {
          label: 'Backend',
          status: data.backendOnline ? 'online' : 'offline',
        },
        modelLoad:
          data.modelCount !== null
            ? {
                label: 'Models Loaded',
                value: Math.min(data.modelCount * 20, 100), // pseudo-visualization
                displayValue: String(data.modelCount),
                status: 'accent',
              }
            : undefined,
      }),
      _jsxs('div', {
        className: 'grid grid-cols-2 sm:grid-cols-3 gap-2',
        children: [
          _jsx(StatCard, {
            icon: _jsx(Shield, { width: 16, height: 16 }),
            label: t('health.auth', 'Authentication'),
            value:
              data.authRequired === null
                ? '--'
                : data.authRequired
                  ? t('health.enabled', 'Enabled')
                  : t('health.devMode', 'Dev Mode'),
          }),
          _jsx(StatCard, {
            icon: _jsx(Clock, { width: 16, height: 16 }),
            label: t('health.uptime', 'Uptime'),
            value:
              data.uptimeSeconds !== null
                ? formatUptime(data.uptimeSeconds)
                : '--',
          }),
        ],
      }),
    ],
  });
});
HealthDashboard.displayName = 'HealthDashboard';
export default HealthDashboard;
