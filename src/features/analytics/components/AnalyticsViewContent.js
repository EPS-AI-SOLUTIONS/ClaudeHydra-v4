// src/features/analytics/components/AnalyticsView.tsx
import { useViewTheme } from '@jaskier/chat-module';
import { Card, cn } from '@jaskier/ui';
import { BarChart3, Clock, DollarSign, Target, Wrench } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { useCostEstimate, useLatency, useSuccessRate, useTokenUsage, useTopTools } from '../hooks/useAnalytics';

function TimeRangeSelector({ value, onChange, isLight }) {
  const ranges = [7, 14, 30];
  return _jsx('div', {
    className: 'flex items-center gap-1',
    children: ranges.map((r) =>
      _jsxs(
        'button',
        {
          type: 'button',
          onClick: () => onChange(r),
          className: cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
            value === r
              ? isLight
                ? 'bg-emerald-500/15 text-emerald-700 shadow-sm'
                : 'bg-white/10 text-white shadow-sm'
              : isLight
                ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                : 'text-white/40 hover:bg-white/5 hover:text-white/70',
          ),
          children: [r, 'd'],
        },
        r,
      ),
    ),
  });
}
// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function formatMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}
function formatUsd(n) {
  return `$${n.toFixed(2)}`;
}
/** Get a consistent color for a model name. */
function modelColor(model, isLight) {
  const m = model.toLowerCase();
  if (m.includes('opus')) return isLight ? 'bg-purple-500' : 'bg-purple-500';
  if (m.includes('sonnet')) return isLight ? 'bg-blue-500' : 'bg-blue-500';
  if (m.includes('haiku')) return isLight ? 'bg-emerald-500' : 'bg-emerald-500';
  return isLight ? 'bg-gray-400' : 'bg-gray-500';
}
function modelColorText(model, isLight) {
  const m = model.toLowerCase();
  if (m.includes('opus')) return isLight ? 'text-purple-600' : 'text-purple-400';
  if (m.includes('sonnet')) return isLight ? 'text-blue-600' : 'text-blue-400';
  if (m.includes('haiku')) return isLight ? 'text-emerald-600' : 'text-emerald-400';
  return isLight ? 'text-gray-600' : 'text-gray-400';
}
function tierColor(tier, isLight) {
  const t = tier.toLowerCase();
  if (t === 'opus' || t === 'commander') return isLight ? 'bg-purple-500' : 'bg-purple-500';
  if (t === 'sonnet' || t === 'coordinator') return isLight ? 'bg-blue-500' : 'bg-blue-500';
  if (t === 'haiku' || t === 'executor') return isLight ? 'bg-emerald-500' : 'bg-emerald-500';
  return isLight ? 'bg-gray-400' : 'bg-gray-500';
}
/** Short model label (strip provider prefix, keep variant). */
function shortModel(model) {
  // e.g. "claude-opus-4-6" -> "opus-4-6", "claude-sonnet-4-6" -> "sonnet-4-6"
  return model.replace(/^claude-/, '').replace(/^models\//, '');
}
// ---------------------------------------------------------------------------
// Token Usage Card
// ---------------------------------------------------------------------------
function TokenUsageCard({ data, isLight }) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return _jsx(EmptyState, {
      icon: _jsx(BarChart3, { size: 20, className: 'text-[var(--matrix-text-secondary)]' }),
      message: t('analytics.noTokenData', 'No token usage data yet'),
    });
  }
  // Aggregate by day (combine all models per day)
  const byDay = new Map();
  for (const row of data) {
    const entry = byDay.get(row.day) ?? { input: 0, output: 0, models: new Map() };
    entry.input += row.input_tokens;
    entry.output += row.output_tokens;
    entry.models.set(row.model, (entry.models.get(row.model) ?? 0) + row.total_tokens);
    byDay.set(row.day, entry);
  }
  const days = Array.from(byDay.entries());
  const maxTotal = Math.max(...days.map(([, d]) => d.input + d.output), 1);
  return _jsxs('div', {
    className: 'space-y-2',
    children: [
      days.map(([day, d]) => {
        const totalPct = ((d.input + d.output) / maxTotal) * 100;
        const inputPct = (d.input / (d.input + d.output || 1)) * totalPct;
        const outputPct = totalPct - inputPct;
        return _jsxs(
          'div',
          {
            className: 'flex items-center gap-3',
            children: [
              _jsx('span', {
                className: 'font-mono text-xs text-[var(--matrix-text-secondary)] w-20 shrink-0',
                children: day.slice(5),
              }),
              _jsxs('div', {
                className: 'flex-1 flex h-5 rounded overflow-hidden bg-[var(--matrix-bg-secondary)]',
                children: [
                  _jsx('div', {
                    className: cn('h-full transition-all', isLight ? 'bg-blue-400' : 'bg-blue-500'),
                    style: { width: `${inputPct}%` },
                    title: `Input: ${formatTokens(d.input)}`,
                  }),
                  _jsx('div', {
                    className: cn('h-full transition-all', isLight ? 'bg-emerald-400' : 'bg-emerald-500'),
                    style: { width: `${outputPct}%` },
                    title: `Output: ${formatTokens(d.output)}`,
                  }),
                ],
              }),
              _jsx('span', {
                className: 'font-mono text-xs text-[var(--matrix-text-secondary)] w-16 text-right shrink-0',
                children: formatTokens(d.input + d.output),
              }),
            ],
          },
          day,
        );
      }),
      _jsxs('div', {
        className: 'flex items-center gap-4 pt-1 text-xs text-[var(--matrix-text-secondary)]',
        children: [
          _jsxs('span', {
            className: 'flex items-center gap-1.5',
            children: [
              _jsx('span', { className: cn('w-2.5 h-2.5 rounded-sm', isLight ? 'bg-blue-400' : 'bg-blue-500') }),
              'Input',
            ],
          }),
          _jsxs('span', {
            className: 'flex items-center gap-1.5',
            children: [
              _jsx('span', { className: cn('w-2.5 h-2.5 rounded-sm', isLight ? 'bg-emerald-400' : 'bg-emerald-500') }),
              'Output',
            ],
          }),
        ],
      }),
    ],
  });
}
// ---------------------------------------------------------------------------
// Latency Card
// ---------------------------------------------------------------------------
function LatencyCard({ data, isLight }) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return _jsx(EmptyState, {
      icon: _jsx(Clock, { size: 20, className: 'text-[var(--matrix-text-secondary)]' }),
      message: t('analytics.noLatencyData', 'No latency data yet'),
    });
  }
  // Aggregate across all days per tier
  const byTier = new Map();
  for (const row of data) {
    const entry = byTier.get(row.tier) ?? { avg: [], p50: [], p95: [], count: 0 };
    entry.avg.push(row.avg_ms);
    entry.p50.push(row.p50_ms);
    entry.p95.push(row.p95_ms);
    entry.count += row.request_count;
    byTier.set(row.tier, entry);
  }
  const tiers = Array.from(byTier.entries()).map(([tier, d]) => ({
    tier,
    avg: d.avg.reduce((a, b) => a + b, 0) / d.avg.length,
    p50: d.p50.reduce((a, b) => a + b, 0) / d.p50.length,
    p95: d.p95.reduce((a, b) => a + b, 0) / d.p95.length,
    count: d.count,
  }));
  return _jsx('div', {
    className: 'overflow-x-auto',
    children: _jsxs('table', {
      className: 'w-full text-sm',
      children: [
        _jsx('thead', {
          children: _jsxs('tr', {
            className: cn('border-b', isLight ? 'border-gray-200' : 'border-white/10'),
            children: [
              _jsx('th', {
                className: 'text-left py-2 px-2 font-medium text-[var(--matrix-text-secondary)]',
                children: t('analytics.tier', 'Tier'),
              }),
              _jsx('th', {
                className: 'text-right py-2 px-2 font-medium text-[var(--matrix-text-secondary)]',
                children: 'Avg',
              }),
              _jsx('th', {
                className: 'text-right py-2 px-2 font-medium text-[var(--matrix-text-secondary)]',
                children: 'P50',
              }),
              _jsx('th', {
                className: 'text-right py-2 px-2 font-medium text-[var(--matrix-text-secondary)]',
                children: 'P95',
              }),
              _jsx('th', {
                className: 'text-right py-2 px-2 font-medium text-[var(--matrix-text-secondary)]',
                children: t('analytics.requests', 'Requests'),
              }),
            ],
          }),
        }),
        _jsx('tbody', {
          children: tiers.map((row) =>
            _jsxs(
              'tr',
              {
                className: cn('transition-colors', isLight ? 'hover:bg-black/[0.02]' : 'hover:bg-white/[0.03]'),
                children: [
                  _jsx('td', {
                    className: 'py-2 px-2',
                    children: _jsxs('span', {
                      className: 'flex items-center gap-2',
                      children: [
                        _jsx('span', { className: cn('w-2 h-2 rounded-full', tierColor(row.tier, isLight)) }),
                        _jsx('span', { className: 'font-mono text-sm capitalize', children: row.tier }),
                      ],
                    }),
                  }),
                  _jsx('td', { className: 'text-right py-2 px-2 font-mono text-sm', children: formatMs(row.avg) }),
                  _jsx('td', { className: 'text-right py-2 px-2 font-mono text-sm', children: formatMs(row.p50) }),
                  _jsx('td', { className: 'text-right py-2 px-2 font-mono text-sm', children: formatMs(row.p95) }),
                  _jsx('td', {
                    className: 'text-right py-2 px-2 font-mono text-sm text-[var(--matrix-text-secondary)]',
                    children: row.count,
                  }),
                ],
              },
              row.tier,
            ),
          ),
        }),
      ],
    }),
  });
}
// ---------------------------------------------------------------------------
// Success Rate Card
// ---------------------------------------------------------------------------
function SuccessRateCard({ data, isLight }) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return _jsx(EmptyState, {
      icon: _jsx(Target, { size: 20, className: 'text-[var(--matrix-text-secondary)]' }),
      message: t('analytics.noSuccessData', 'No success rate data yet'),
    });
  }
  return _jsx('div', {
    className: 'space-y-3',
    children: data.map((row) => {
      const rateColor =
        row.success_rate >= 95
          ? isLight
            ? 'text-emerald-600'
            : 'text-emerald-400'
          : row.success_rate >= 80
            ? isLight
              ? 'text-amber-600'
              : 'text-amber-400'
            : isLight
              ? 'text-red-600'
              : 'text-red-400';
      const dotColor =
        row.success_rate >= 95 ? 'bg-emerald-500' : row.success_rate >= 80 ? 'bg-amber-500' : 'bg-red-500';
      return _jsxs(
        'div',
        {
          className: 'flex items-center gap-3',
          children: [
            _jsx('span', { className: cn('w-2.5 h-2.5 rounded-full shrink-0', dotColor) }),
            _jsx('span', {
              className: cn('font-mono text-sm truncate flex-1 min-w-0', modelColorText(row.model, isLight)),
              title: row.model,
              children: shortModel(row.model),
            }),
            _jsxs('span', {
              className: cn('font-mono text-sm font-bold shrink-0', rateColor),
              children: [row.success_rate.toFixed(1), '%'],
            }),
            _jsxs('span', {
              className: 'text-xs text-[var(--matrix-text-secondary)] shrink-0 w-16 text-right',
              children: [row.successes, '/', row.total],
            }),
          ],
        },
        row.model,
      );
    }),
  });
}
// ---------------------------------------------------------------------------
// Top Tools Card
// ---------------------------------------------------------------------------
function TopToolsCard({ data, isLight }) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return _jsx(EmptyState, {
      icon: _jsx(Wrench, { size: 20, className: 'text-[var(--matrix-text-secondary)]' }),
      message: t('analytics.noToolData', 'No tool usage data yet'),
    });
  }
  const maxCount = Math.max(...data.map((d) => d.usage_count), 1);
  return _jsx('div', {
    className: 'space-y-2',
    children: data.map((row, idx) => {
      const pct = (row.usage_count / maxCount) * 100;
      const hasErrors = row.error_count > 0;
      return _jsxs(
        'div',
        {
          className: 'flex items-center gap-3',
          children: [
            _jsxs('span', {
              className: 'font-mono text-xs text-[var(--matrix-text-secondary)] w-5 shrink-0 text-right',
              children: [idx + 1, '.'],
            }),
            _jsxs('div', {
              className: 'flex-1 min-w-0',
              children: [
                _jsxs('div', {
                  className: 'flex items-center gap-2 mb-0.5',
                  children: [
                    _jsx('span', { className: 'font-mono text-sm truncate', children: row.tool_name }),
                    hasErrors &&
                      _jsxs('span', {
                        className: cn(
                          'text-[10px] px-1.5 py-0.5 rounded',
                          isLight ? 'bg-red-100 text-red-600' : 'bg-red-500/15 text-red-400',
                        ),
                        children: [row.error_count, ' err'],
                      }),
                  ],
                }),
                _jsx('div', {
                  className: 'h-1.5 rounded-full overflow-hidden bg-[var(--matrix-bg-secondary)]',
                  children: _jsx('div', {
                    className: cn('h-full rounded-full transition-all', isLight ? 'bg-blue-400' : 'bg-blue-500'),
                    style: { width: `${pct}%` },
                  }),
                }),
              ],
            }),
            _jsx('span', {
              className: 'font-mono text-xs text-[var(--matrix-text-secondary)] w-10 text-right shrink-0',
              children: row.usage_count,
            }),
          ],
        },
        row.tool_name,
      );
    }),
  });
}
// ---------------------------------------------------------------------------
// Cost Estimate Card
// ---------------------------------------------------------------------------
function CostCard({ data, totalCost, projectedMonthly, days, isLight }) {
  const { t } = useTranslation();
  return _jsxs('div', {
    className: 'space-y-4',
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-6',
        children: [
          _jsxs('div', {
            children: [
              _jsxs('p', {
                className: 'text-xs text-[var(--matrix-text-secondary)] uppercase tracking-wider',
                children: [t('analytics.periodCost', 'Period cost'), ' (', days, 'd)'],
              }),
              _jsx('p', {
                className: cn('text-2xl font-bold font-mono', isLight ? 'text-gray-900' : 'text-white'),
                children: formatUsd(totalCost),
              }),
            ],
          }),
          _jsx('div', { className: cn('h-10 w-px', isLight ? 'bg-gray-200' : 'bg-white/10') }),
          _jsxs('div', {
            children: [
              _jsx('p', {
                className: 'text-xs text-[var(--matrix-text-secondary)] uppercase tracking-wider',
                children: t('analytics.projected', 'Projected monthly'),
              }),
              _jsx('p', {
                className: cn('text-2xl font-bold font-mono', isLight ? 'text-emerald-600' : 'text-emerald-400'),
                children: formatUsd(projectedMonthly),
              }),
            ],
          }),
        ],
      }),
      data.length > 0
        ? _jsx('div', {
            className: 'space-y-2',
            children: data.map((row) =>
              _jsxs(
                'div',
                {
                  className: cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg',
                    isLight ? 'bg-gray-50' : 'bg-white/[0.03]',
                  ),
                  children: [
                    _jsx('span', { className: cn('w-2 h-2 rounded-full shrink-0', modelColor(row.model, isLight)) }),
                    _jsx('span', {
                      className: cn('font-mono text-sm flex-1 truncate', modelColorText(row.model, isLight)),
                      children: shortModel(row.model),
                    }),
                    _jsxs('span', {
                      className: 'text-xs text-[var(--matrix-text-secondary)]',
                      children: [formatTokens(row.input_tokens), ' in / ', formatTokens(row.output_tokens), ' out'],
                    }),
                    _jsx('span', {
                      className: 'font-mono text-sm font-bold w-16 text-right',
                      children: formatUsd(row.total_cost_usd),
                    }),
                  ],
                },
                `${row.model}-${row.tier}`,
              ),
            ),
          })
        : _jsx(EmptyState, {
            icon: _jsx(DollarSign, { size: 20, className: 'text-[var(--matrix-text-secondary)]' }),
            message: t('analytics.noCostData', 'No cost data yet'),
          }),
    ],
  });
}
// ---------------------------------------------------------------------------
// Empty state helper
// ---------------------------------------------------------------------------
function EmptyState({ icon, message }) {
  return _jsxs('div', {
    className: 'flex flex-col items-center gap-2 py-6',
    children: [icon, _jsx('p', { className: 'text-sm text-[var(--matrix-text-secondary)]', children: message })],
  });
}
// ---------------------------------------------------------------------------
// Section card wrapper
// ---------------------------------------------------------------------------
function SectionCard({ icon, title, isLight, isLoading, isError, children }) {
  const { t } = useTranslation();
  return _jsx(Card, {
    children: _jsxs('div', {
      className: 'space-y-4',
      children: [
        _jsxs('div', {
          className: 'flex items-center gap-2',
          children: [
            icon,
            _jsx('h2', {
              className: cn('text-base font-semibold', isLight ? 'text-gray-800' : 'text-white/90'),
              children: title,
            }),
          ],
        }),
        isLoading &&
          _jsx('p', {
            className: 'text-sm text-[var(--matrix-text-secondary)] text-center py-6',
            children: t('common.loading', 'Loading...'),
          }),
        isError &&
          _jsx('p', {
            className: 'text-sm text-red-400 text-center py-6',
            children: t('common.loadError', 'Failed to load data'),
          }),
        !isLoading && !isError && children,
      ],
    }),
  });
}
// ---------------------------------------------------------------------------
// Main AnalyticsView
// ---------------------------------------------------------------------------
const AnalyticsViewContent = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const isLight = theme.isLight;
  const [days, setDays] = useState(7);
  const tokens = useTokenUsage(days);
  const latency = useLatency(days);
  const successRate = useSuccessRate(days);
  const topTools = useTopTools(days);
  const cost = useCostEstimate(days);
  return _jsx('div', {
    className: 'h-full flex flex-col items-center p-8 overflow-y-auto',
    children: _jsxs(motion.div, {
      className: 'w-full max-w-5xl space-y-6',
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, ease: 'easeOut' },
      children: [
        _jsxs('div', {
          className: 'flex items-center gap-3 flex-wrap',
          children: [
            _jsx(BarChart3, { size: 22, className: 'text-[var(--matrix-accent)]' }),
            _jsx('h1', {
              className: cn('text-2xl font-bold font-mono tracking-tight', theme.title),
              children: t('analytics.title', 'Analytics'),
            }),
            _jsx('div', {
              className: 'ml-auto',
              children: _jsx(TimeRangeSelector, { value: days, onChange: setDays, isLight: isLight }),
            }),
          ],
        }),
        _jsx(SectionCard, {
          icon: _jsx(DollarSign, { size: 18, className: isLight ? 'text-emerald-600' : 'text-emerald-400' }),
          title: t('analytics.costEstimate', 'Cost Estimate'),
          isLight: isLight,
          isLoading: cost.isLoading,
          isError: cost.isError,
          children: _jsx(CostCard, {
            data: cost.data?.data ?? [],
            totalCost: cost.data?.total_cost_usd ?? 0,
            projectedMonthly: cost.data?.projected_monthly_usd ?? 0,
            days: days,
            isLight: isLight,
          }),
        }),
        _jsxs('div', {
          className: 'grid grid-cols-1 lg:grid-cols-2 gap-6',
          children: [
            _jsx(SectionCard, {
              icon: _jsx(BarChart3, { size: 18, className: isLight ? 'text-blue-600' : 'text-blue-400' }),
              title: t('analytics.tokenUsage', 'Token Usage'),
              isLight: isLight,
              isLoading: tokens.isLoading,
              isError: tokens.isError,
              children: _jsx(TokenUsageCard, { data: tokens.data?.data ?? [], isLight: isLight }),
            }),
            _jsx(SectionCard, {
              icon: _jsx(Target, { size: 18, className: isLight ? 'text-amber-600' : 'text-amber-400' }),
              title: t('analytics.successRate', 'Success Rate'),
              isLight: isLight,
              isLoading: successRate.isLoading,
              isError: successRate.isError,
              children: _jsx(SuccessRateCard, { data: successRate.data?.data ?? [], isLight: isLight }),
            }),
          ],
        }),
        _jsxs('div', {
          className: 'grid grid-cols-1 lg:grid-cols-2 gap-6',
          children: [
            _jsx(SectionCard, {
              icon: _jsx(Clock, { size: 18, className: isLight ? 'text-purple-600' : 'text-purple-400' }),
              title: t('analytics.latency', 'Response Latency'),
              isLight: isLight,
              isLoading: latency.isLoading,
              isError: latency.isError,
              children: _jsx(LatencyCard, { data: latency.data?.data ?? [], isLight: isLight }),
            }),
            _jsx(SectionCard, {
              icon: _jsx(Wrench, { size: 18, className: isLight ? 'text-orange-600' : 'text-orange-400' }),
              title: t('analytics.topTools', 'Top Tools'),
              isLight: isLight,
              isLoading: topTools.isLoading,
              isError: topTools.isError,
              children: _jsx(TopToolsCard, { data: topTools.data?.data ?? [], isLight: isLight }),
            }),
          ],
        }),
      ],
    }),
  });
});
AnalyticsViewContent.displayName = 'AnalyticsViewContent';
export default AnalyticsViewContent;
