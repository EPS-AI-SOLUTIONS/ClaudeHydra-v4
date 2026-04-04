/**
 * SemanticCacheView — Dashboard for the Semantic Cache & Context Compression system.
 *
 * Shows cache hit/miss metrics, cost savings, Qdrant health, TTL config,
 * cached entries list, and manual invalidation controls.
 */
import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  DollarSign,
  Gauge,
  RefreshCw,
  Settings2,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import {
  useCacheConfig,
  useCacheEntries,
  useCacheHealth,
  useCacheStats,
  useDeleteEntry,
  useInvalidateCache,
  useUpdateConfig,
} from '../hooks/useSemanticCache';

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, subtitle, isDark }) {
  return _jsx('div', {
    className: cn(
      'rounded-xl p-4 border transition-all',
      isDark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-gray-200 shadow-sm',
    ),
    children: _jsxs('div', {
      className: 'flex items-center gap-3',
      children: [
        _jsx('div', { className: cn('p-2 rounded-lg', color), children: _jsx(Icon, { size: 18 }) }),
        _jsxs('div', {
          className: 'flex-1 min-w-0',
          children: [
            _jsx('p', {
              className: cn('text-xs font-medium', isDark ? 'text-white/50' : 'text-gray-500'),
              children: label,
            }),
            _jsx('p', {
              className: cn('text-xl font-bold tabular-nums', isDark ? 'text-white' : 'text-gray-900'),
              children: value,
            }),
            subtitle &&
              _jsx('p', {
                className: cn('text-[10px] mt-0.5', isDark ? 'text-white/40' : 'text-gray-400'),
                children: subtitle,
              }),
          ],
        }),
      ],
    }),
  });
}
// ── Health Badge ─────────────────────────────────────────────────────────────
function HealthBadge({ ok, label, isDark }) {
  return _jsxs('div', {
    className: 'flex items-center gap-2',
    children: [
      ok
        ? _jsx(CheckCircle2, { size: 14, className: 'text-green-400' })
        : _jsx(XCircle, { size: 14, className: 'text-red-400' }),
      _jsx('span', { className: cn('text-sm', isDark ? 'text-white/70' : 'text-gray-600'), children: label }),
    ],
  });
}
// ── Entry Row ────────────────────────────────────────────────────────────────
function EntryRow({ entry, isDark, onDelete }) {
  return _jsxs('div', {
    className: cn(
      'flex items-center gap-3 px-3 py-2 rounded-lg border transition-all',
      isDark ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]' : 'bg-white border-gray-100 hover:bg-gray-50',
    ),
    children: [
      _jsxs('div', {
        className: 'flex-1 min-w-0',
        children: [
          _jsx('p', {
            className: cn('text-sm truncate', isDark ? 'text-white/80' : 'text-gray-700'),
            children: entry.query_preview,
          }),
          _jsxs('div', {
            className: 'flex items-center gap-3 mt-1',
            children: [
              _jsx('span', {
                className: cn('text-[10px]', isDark ? 'text-white/40' : 'text-gray-400'),
                children: entry.model,
              }),
              _jsxs('span', {
                className: cn('text-[10px]', isDark ? 'text-white/40' : 'text-gray-400'),
                children: [entry.token_count, ' tokens'],
              }),
              _jsxs('span', {
                className: cn('text-[10px]', isDark ? 'text-white/40' : 'text-gray-400'),
                children: [entry.hit_count, ' hits'],
              }),
              _jsx('span', {
                className: cn('text-[10px]', isDark ? 'text-white/40' : 'text-gray-400'),
                children: new Date(entry.created_at).toLocaleDateString(),
              }),
            ],
          }),
        ],
      }),
      _jsx('button', {
        type: 'button',
        onClick: onDelete,
        className: cn(
          'p-1.5 rounded-md transition-colors',
          isDark
            ? 'hover:bg-red-500/20 text-white/30 hover:text-red-400'
            : 'hover:bg-red-50 text-gray-300 hover:text-red-500',
        ),
        title: 'Delete entry',
        children: _jsx(Trash2, { size: 14 }),
      }),
    ],
  });
}
// ── Main View ────────────────────────────────────────────────────────────────
function SemanticCacheViewContent() {
  const theme = useViewTheme();
  const isDark = !theme.isLight;
  const { data: stats, isLoading: statsLoading } = useCacheStats();
  const { data: health } = useCacheHealth();
  const { data: config } = useCacheConfig();
  const { data: entries } = useCacheEntries(20);
  const updateConfig = useUpdateConfig();
  const deleteEntry = useDeleteEntry();
  const invalidateCache = useInvalidateCache();
  const [showConfig, setShowConfig] = useState(false);
  const metrics = stats?.metrics;
  const collection = stats?.collection;
  const hitRatePercent = metrics ? (metrics.hit_rate * 100).toFixed(1) : '0.0';
  const costSaved = metrics?.estimated_cost_saved_usd.toFixed(4) ?? '0.0000';
  const avgLatency = metrics?.avg_search_latency_ms.toFixed(1) ?? '0.0';
  return _jsx('div', {
    className: 'h-full overflow-y-auto p-6',
    children: _jsxs('div', {
      className: 'max-w-6xl mx-auto space-y-6',
      children: [
        _jsxs('div', {
          className: 'flex items-center justify-between',
          children: [
            _jsxs('div', {
              children: [
                _jsx('h1', {
                  className: cn('text-2xl font-bold', isDark ? 'text-white' : 'text-gray-900'),
                  children: 'Semantic Cache',
                }),
                _jsx('p', {
                  className: cn('text-sm mt-1', isDark ? 'text-white/50' : 'text-gray-500'),
                  children: 'Qdrant Vector Router \u2022 AST Context Compression \u2022 Few-Shot Fallback',
                }),
              ],
            }),
            _jsxs('div', {
              className: 'flex items-center gap-2',
              children: [
                _jsxs('button', {
                  type: 'button',
                  onClick: () => setShowConfig(!showConfig),
                  className: cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all',
                    isDark
                      ? 'bg-white/10 hover:bg-white/15 text-white/70'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-600',
                  ),
                  children: [_jsx(Settings2, { size: 14 }), 'Config'],
                }),
                _jsxs('button', {
                  type: 'button',
                  onClick: () => invalidateCache.mutate({ flush_all: true }),
                  className: cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all',
                    isDark
                      ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400'
                      : 'bg-red-50 hover:bg-red-100 text-red-600',
                  ),
                  disabled: invalidateCache.isPending,
                  children: [
                    _jsx(RefreshCw, { size: 14, className: invalidateCache.isPending ? 'animate-spin' : '' }),
                    'Flush Cache',
                  ],
                }),
              ],
            }),
          ],
        }),
        health &&
          _jsxs('div', {
            className: cn(
              'flex items-center gap-6 px-4 py-3 rounded-xl border',
              isDark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-gray-200',
            ),
            children: [
              _jsx(HealthBadge, { ok: health.qdrant_reachable, label: 'Qdrant', isDark: isDark }),
              _jsx(HealthBadge, { ok: health.embedding_configured, label: 'Embeddings', isDark: isDark }),
              _jsx(HealthBadge, { ok: health.cache_enabled, label: 'Cache Enabled', isDark: isDark }),
              _jsx(HealthBadge, { ok: health.collection_exists, label: 'Collection', isDark: isDark }),
              collection &&
                _jsxs('span', {
                  className: cn('text-xs ml-auto', isDark ? 'text-white/40' : 'text-gray-400'),
                  children: [collection.points_count, ' points \u2022 ', collection.status],
                }),
            ],
          }),
        _jsxs('div', {
          className: 'grid grid-cols-2 md:grid-cols-4 gap-4',
          children: [
            _jsx(StatCard, {
              label: 'Cache Hit Rate',
              value: `${hitRatePercent}%`,
              icon: Gauge,
              color: isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600',
              subtitle: `${metrics?.exact_hits ?? 0} exact + ${metrics?.partial_hits ?? 0} partial`,
              isDark: isDark,
            }),
            _jsx(StatCard, {
              label: 'Cost Saved (USD)',
              value: `$${costSaved}`,
              icon: DollarSign,
              color: isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-600',
              subtitle: `${metrics?.tokens_saved ?? 0} tokens saved`,
              isDark: isDark,
            }),
            _jsx(StatCard, {
              label: 'Avg Search Latency',
              value: `${avgLatency}ms`,
              icon: Zap,
              color: isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600',
              subtitle: 'Qdrant cosine search',
              isDark: isDark,
            }),
            _jsx(StatCard, {
              label: 'Total Queries',
              value: metrics?.total_queries ?? 0,
              icon: Activity,
              color: isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-600',
              subtitle: `${metrics?.misses ?? 0} cache misses`,
              isDark: isDark,
            }),
          ],
        }),
        metrics &&
          metrics.total_queries > 0 &&
          _jsxs('div', {
            className: cn(
              'rounded-xl p-4 border',
              isDark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-gray-200',
            ),
            children: [
              _jsx('h3', {
                className: cn('text-sm font-medium mb-3', isDark ? 'text-white/70' : 'text-gray-600'),
                children: 'Hit/Miss Distribution',
              }),
              _jsxs('div', {
                className: 'flex h-4 rounded-full overflow-hidden',
                children: [
                  metrics.exact_hits > 0 &&
                    _jsx('div', {
                      className: 'bg-emerald-500 transition-all',
                      style: { width: `${(metrics.exact_hits / metrics.total_queries) * 100}%` },
                      title: `Exact: ${metrics.exact_hits}`,
                    }),
                  metrics.partial_hits > 0 &&
                    _jsx('div', {
                      className: 'bg-amber-500 transition-all',
                      style: { width: `${(metrics.partial_hits / metrics.total_queries) * 100}%` },
                      title: `Partial: ${metrics.partial_hits}`,
                    }),
                  metrics.misses > 0 &&
                    _jsx('div', {
                      className: cn('transition-all', isDark ? 'bg-white/10' : 'bg-gray-200'),
                      style: { width: `${(metrics.misses / metrics.total_queries) * 100}%` },
                      title: `Miss: ${metrics.misses}`,
                    }),
                ],
              }),
              _jsxs('div', {
                className: 'flex items-center gap-4 mt-2 text-[10px]',
                children: [
                  _jsxs('span', {
                    className: 'flex items-center gap-1',
                    children: [
                      _jsx('span', { className: 'w-2 h-2 rounded-full bg-emerald-500' }),
                      ' Exact (',
                      metrics.exact_hits,
                      ')',
                    ],
                  }),
                  _jsxs('span', {
                    className: 'flex items-center gap-1',
                    children: [
                      _jsx('span', { className: 'w-2 h-2 rounded-full bg-amber-500' }),
                      ' Partial (',
                      metrics.partial_hits,
                      ')',
                    ],
                  }),
                  _jsxs('span', {
                    className: 'flex items-center gap-1',
                    children: [
                      _jsx('span', { className: cn('w-2 h-2 rounded-full', isDark ? 'bg-white/10' : 'bg-gray-200') }),
                      ' Miss (',
                      metrics.misses,
                      ')',
                    ],
                  }),
                ],
              }),
            ],
          }),
        showConfig &&
          config &&
          _jsxs('div', {
            className: cn(
              'rounded-xl p-4 border space-y-4',
              isDark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-gray-200',
            ),
            children: [
              _jsx('h3', {
                className: cn('text-sm font-medium', isDark ? 'text-white/70' : 'text-gray-600'),
                children: 'Configuration',
              }),
              _jsxs('div', {
                className: 'grid grid-cols-2 md:grid-cols-3 gap-4',
                children: [
                  _jsx(ConfigField, {
                    label: 'Cache Enabled',
                    isDark: isDark,
                    children: _jsx('button', {
                      type: 'button',
                      onClick: () => updateConfig.mutate({ enabled: !config.enabled }),
                      className: cn(
                        'px-3 py-1 rounded text-sm font-medium transition-all',
                        config.enabled
                          ? isDark
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-emerald-100 text-emerald-600'
                          : isDark
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-red-100 text-red-600',
                      ),
                      children: config.enabled ? 'ON' : 'OFF',
                    }),
                  }),
                  _jsx(ConfigField, {
                    label: 'TTL (hours)',
                    isDark: isDark,
                    children: _jsxs('span', {
                      className: cn('text-sm font-mono', isDark ? 'text-white/80' : 'text-gray-800'),
                      children: [(config.ttl_seconds / 3600).toFixed(0), 'h'],
                    }),
                  }),
                  _jsx(ConfigField, {
                    label: 'Exact Hit Threshold',
                    isDark: isDark,
                    children: _jsxs('span', {
                      className: cn('text-sm font-mono', isDark ? 'text-white/80' : 'text-gray-800'),
                      children: [(config.exact_hit_threshold * 100).toFixed(0), '%'],
                    }),
                  }),
                  _jsx(ConfigField, {
                    label: 'Partial Hit Threshold',
                    isDark: isDark,
                    children: _jsxs('span', {
                      className: cn('text-sm font-mono', isDark ? 'text-white/80' : 'text-gray-800'),
                      children: [(config.partial_hit_threshold * 100).toFixed(0), '%'],
                    }),
                  }),
                  _jsx(ConfigField, {
                    label: 'Embedding Model',
                    isDark: isDark,
                    children: _jsx('span', {
                      className: cn('text-xs font-mono truncate', isDark ? 'text-white/60' : 'text-gray-600'),
                      children: config.embedding_model,
                    }),
                  }),
                  _jsx(ConfigField, {
                    label: 'Vector Size',
                    isDark: isDark,
                    children: _jsx('span', {
                      className: cn('text-sm font-mono', isDark ? 'text-white/80' : 'text-gray-800'),
                      children: config.vector_size,
                    }),
                  }),
                ],
              }),
            ],
          }),
        _jsxs('div', {
          className: cn('rounded-xl border', isDark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-gray-200'),
          children: [
            _jsx('div', {
              className: 'flex items-center justify-between px-4 py-3 border-b border-inherit',
              children: _jsxs('div', {
                className: 'flex items-center gap-2',
                children: [
                  _jsx(Database, { size: 14, className: isDark ? 'text-white/50' : 'text-gray-400' }),
                  _jsx('h3', {
                    className: cn('text-sm font-medium', isDark ? 'text-white/70' : 'text-gray-600'),
                    children: 'Cached Entries',
                  }),
                  _jsxs('span', {
                    className: cn('text-xs', isDark ? 'text-white/40' : 'text-gray-400'),
                    children: ['(', entries?.total_estimate ?? 0, ' total)'],
                  }),
                ],
              }),
            }),
            _jsxs('div', {
              className: 'p-3 space-y-1.5 max-h-[400px] overflow-y-auto',
              children: [
                entries?.entries.length === 0 &&
                  _jsx('p', {
                    className: cn('text-sm text-center py-8', isDark ? 'text-white/30' : 'text-gray-400'),
                    children: 'No cached entries yet',
                  }),
                entries?.entries.map((entry) =>
                  _jsx(
                    EntryRow,
                    { entry: entry, isDark: isDark, onDelete: () => deleteEntry.mutate(entry.id) },
                    entry.id,
                  ),
                ),
              ],
            }),
          ],
        }),
        statsLoading &&
          _jsx('div', {
            className: 'flex items-center justify-center py-12',
            children: _jsxs('div', {
              className: 'flex items-center gap-3',
              children: [
                _jsx('div', {
                  className: 'w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin',
                }),
                _jsx('span', {
                  className: cn('text-sm', isDark ? 'text-white/50' : 'text-gray-500'),
                  children: 'Loading cache metrics...',
                }),
              ],
            }),
          }),
        health &&
          !health.qdrant_reachable &&
          _jsxs('div', {
            className: 'flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20',
            children: [
              _jsx(AlertTriangle, { size: 16, className: 'text-amber-400 shrink-0' }),
              _jsxs('p', {
                className: 'text-sm text-amber-300',
                children: [
                  'Qdrant is unreachable at ',
                  config?.qdrant_url ?? 'localhost:6333',
                  '. Start Qdrant to enable semantic caching.',
                ],
              }),
            ],
          }),
      ],
    }),
  });
}
// ── Config Field ─────────────────────────────────────────────────────────────
function ConfigField({ label, isDark, children }) {
  return _jsxs('div', {
    children: [
      _jsx('p', {
        className: cn(
          'text-[10px] font-medium uppercase tracking-wider mb-1',
          isDark ? 'text-white/40' : 'text-gray-400',
        ),
        children: label,
      }),
      children,
    ],
  });
}
export default SemanticCacheViewContent;
