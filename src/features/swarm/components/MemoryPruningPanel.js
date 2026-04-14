import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import {
  Fragment as _Fragment,
  jsx as _jsx,
  jsxs as _jsxs,
} from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
/**
 * MemoryPruningPanel — Advanced Agent Self-Reflection & Memory Pruning Dashboard
 *
 * Displays pruning metrics, cycle history, configuration controls,
 * and detailed log entries for each pruning cycle.
 * Integrated into SwarmView as a tab alongside Monitoring and Builder.
 */
import BarChart3 from '~icons/lucide/bar-chart-3';
import Brain from '~icons/lucide/brain';
import CheckCircle2 from '~icons/lucide/check-circle-2';
import ChevronDown from '~icons/lucide/chevron-down';
import ChevronRight from '~icons/lucide/chevron-right';
import Clock from '~icons/lucide/clock';
import GitMerge from '~icons/lucide/git-merge';
import Layers from '~icons/lucide/layers';
import Loader2 from '~icons/lucide/loader-2';
import Play from '~icons/lucide/play';
import Settings2 from '~icons/lucide/settings-2';
import Trash2 from '~icons/lucide/trash-2';
import XCircle from '~icons/lucide/x-circle';
import Zap from '~icons/lucide/zap';
import {
  usePruningConfig,
  usePruningDetails,
  usePruningHistory,
  usePruningStats,
  useTriggerPrune,
  useUpdatePruningConfig,
} from '../hooks/useMemoryPruning';

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }) {
  return _jsxs('div', {
    style: {
      background: '#1a1a2e',
      border: '1px solid #2a2a4e',
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    children: [
      _jsx('div', {
        style: {
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        children: _jsx(Icon, { width: 20, height: 20, color: color }),
      }),
      _jsxs('div', {
        children: [
          _jsx('div', {
            style: {
              fontSize: '11px',
              color: '#8b8ba7',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            },
            children: label,
          }),
          _jsx('div', {
            style: { fontSize: '20px', fontWeight: 700, color: '#e0e0ff' },
            children: value,
          }),
        ],
      }),
    ],
  });
}
// ── Action Badge ─────────────────────────────────────────────────────────────
const ACTION_STYLES = {
  delete: { bg: '#ef444430', text: '#f87171', icon: Trash2 },
  merge: { bg: '#a855f730', text: '#c084fc', icon: GitMerge },
  keep: { bg: '#22c55e30', text: '#4ade80', icon: CheckCircle2 },
  archive: { bg: '#eab30830', text: '#facc15', icon: Layers },
};
function ActionBadge({ action }) {
  const style = ACTION_STYLES[action] ?? {
    bg: '#22c55e30',
    text: '#4ade80',
    icon: CheckCircle2,
  };
  const Icon = style.icon;
  return _jsxs('span', {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 8px',
      borderRadius: '6px',
      background: style.bg,
      color: style.text,
      fontSize: '12px',
      fontWeight: 600,
    },
    children: [_jsx(Icon, { width: 12, height: 12 }), action],
  });
}
// ── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const colors = {
    completed: { bg: '#22c55e30', text: '#4ade80' },
    running: { bg: '#3b82f630', text: '#60a5fa' },
    failed: { bg: '#ef444430', text: '#f87171' },
  };
  const c = colors[status] ?? { bg: '#22c55e30', text: '#4ade80' };
  return _jsx('span', {
    style: {
      padding: '2px 8px',
      borderRadius: '6px',
      background: c.bg,
      color: c.text,
      fontSize: '12px',
      fontWeight: 600,
    },
    children: status,
  });
}
// ── Cycle Details Panel ──────────────────────────────────────────────────────
function CycleDetails({ cycleId }) {
  const { data, isLoading } = usePruningDetails(cycleId);
  const { t } = useTranslation();
  if (isLoading) {
    return _jsxs('div', {
      style: {
        padding: '12px',
        color: '#8b8ba7',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      },
      children: [
        _jsx(Loader2, { width: 14, height: 14, className: 'animate-spin' }),
        t('pruning.loadingDetails'),
      ],
    });
  }
  const entries = data?.entries ?? [];
  if (entries.length === 0) {
    return _jsx('div', {
      style: { padding: '12px', color: '#6b7280', fontSize: '13px' },
      children: t('pruning.noEntries'),
    });
  }
  return _jsx('div', {
    style: { maxHeight: '300px', overflowY: 'auto' },
    children: _jsxs('table', {
      style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
      children: [
        _jsx('thead', {
          children: _jsxs('tr', {
            style: { borderBottom: '1px solid #2a2a4e', color: '#8b8ba7' },
            children: [
              _jsx('th', {
                style: { padding: '8px', textAlign: 'left' },
                children: t('pruning.table.entity'),
              }),
              _jsx('th', {
                style: { padding: '8px', textAlign: 'left' },
                children: t('pruning.table.action'),
              }),
              _jsx('th', {
                style: { padding: '8px', textAlign: 'left' },
                children: t('pruning.table.reason'),
              }),
              _jsx('th', {
                style: { padding: '8px', textAlign: 'right' },
                children: t('pruning.table.similarity'),
              }),
              _jsx('th', {
                style: { padding: '8px', textAlign: 'right' },
                children: t('pruning.table.tokens'),
              }),
            ],
          }),
        }),
        _jsx('tbody', {
          children: entries.map((entry) =>
            _jsxs(
              'tr',
              {
                style: { borderBottom: '1px solid #1a1a2e' },
                children: [
                  _jsxs('td', {
                    style: {
                      padding: '8px',
                      color: '#e0e0ff',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                    },
                    children: [
                      entry.entity_name,
                      entry.merged_into &&
                        _jsxs('div', {
                          style: { fontSize: '11px', color: '#8b8ba7' },
                          children: ['\u2192 ', entry.merged_into],
                        }),
                    ],
                  }),
                  _jsx('td', {
                    style: { padding: '8px' },
                    children: _jsx(ActionBadge, { action: entry.action }),
                  }),
                  _jsx('td', {
                    style: {
                      padding: '8px',
                      color: '#a0a0c0',
                      maxWidth: '250px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    },
                    children: entry.reason,
                  }),
                  _jsx('td', {
                    style: {
                      padding: '8px',
                      textAlign: 'right',
                      color: '#e0e0ff',
                    },
                    children:
                      entry.similarity_score != null
                        ? `${(entry.similarity_score * 100).toFixed(1)}%`
                        : '—',
                  }),
                  _jsx('td', {
                    style: {
                      padding: '8px',
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      color: '#e0e0ff',
                    },
                    children:
                      entry.tokens_before > 0
                        ? _jsxs('span', {
                            children: [
                              entry.tokens_before,
                              ' \u2192 ',
                              entry.tokens_after,
                              entry.tokens_before > entry.tokens_after &&
                                _jsxs('span', {
                                  style: {
                                    color: '#4ade80',
                                    marginLeft: '4px',
                                  },
                                  children: [
                                    '(-',
                                    entry.tokens_before - entry.tokens_after,
                                    ')',
                                  ],
                                }),
                            ],
                          })
                        : '—',
                  }),
                ],
              },
              `${entry.entity_name}-${entry.action}`,
            ),
          ),
        }),
      ],
    }),
  });
}
// ── Main Panel ───────────────────────────────────────────────────────────────
export function MemoryPruningPanel() {
  const { t } = useTranslation();
  const { data: statsData, isLoading: statsLoading } = usePruningStats();
  const { data: historyData } = usePruningHistory(20);
  const { data: configData } = usePruningConfig();
  const updateConfig = useUpdatePruningConfig();
  const triggerPrune = useTriggerPrune();
  const [expandedCycle, setExpandedCycle] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const metrics = statsData?.metrics;
  const isRunning = statsData?.is_running ?? false;
  const cycles = historyData?.cycles ?? [];
  const config = configData;
  return _jsxs('div', {
    style: { padding: '24px', height: '100%', overflow: 'auto' },
    children: [
      _jsxs('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
        },
        children: [
          _jsxs('div', {
            style: { display: 'flex', alignItems: 'center', gap: '12px' },
            children: [
              _jsx(Brain, { width: 24, height: 24, color: '#c084fc' }),
              _jsxs('div', {
                children: [
                  _jsx('h2', {
                    style: { margin: 0, fontSize: '20px', color: '#e0e0ff' },
                    children: t('pruning.title'),
                  }),
                  _jsx('p', {
                    style: { margin: 0, fontSize: '13px', color: '#8b8ba7' },
                    children: t('pruning.subtitle'),
                  }),
                ],
              }),
            ],
          }),
          _jsxs('div', {
            style: { display: 'flex', gap: '8px' },
            children: [
              _jsxs('button', {
                type: 'button',
                onClick: () => setShowConfig(!showConfig),
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #2a2a4e',
                  background: '#1a1a2e',
                  color: '#a0a0c0',
                  cursor: 'pointer',
                  fontSize: '13px',
                },
                children: [
                  _jsx(Settings2, { width: 14, height: 14 }),
                  t('pruning.config'),
                ],
              }),
              _jsx('button', {
                type: 'button',
                onClick: () => triggerPrune.mutate(),
                disabled: isRunning || triggerPrune.isPending,
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isRunning ? '#3b82f6' : '#a855f7',
                  color: '#fff',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  opacity: isRunning ? 0.7 : 1,
                },
                children: isRunning
                  ? _jsxs(_Fragment, {
                      children: [
                        _jsx(Loader2, {
                          width: 14,
                          height: 14,
                          className: 'animate-spin',
                        }),
                        t('pruning.pruningInProgress'),
                      ],
                    })
                  : _jsxs(_Fragment, {
                      children: [
                        _jsx(Play, { width: 14, height: 14 }),
                        t('pruning.triggerPruning'),
                      ],
                    }),
              }),
            ],
          }),
        ],
      }),
      _jsxs('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        },
        children: [
          _jsx(StatCard, {
            label: t('pruning.stats.cycles'),
            value: metrics?.total_cycles ?? 0,
            icon: BarChart3,
            color: '#3b82f6',
          }),
          _jsx(StatCard, {
            label: t('pruning.stats.deleted'),
            value: metrics?.total_deleted ?? 0,
            icon: Trash2,
            color: '#ef4444',
          }),
          _jsx(StatCard, {
            label: t('pruning.stats.merged'),
            value: metrics?.total_merged ?? 0,
            icon: GitMerge,
            color: '#a855f7',
          }),
          _jsx(StatCard, {
            label: t('pruning.stats.tokensSaved'),
            value: metrics?.total_tokens_saved?.toLocaleString() ?? '0',
            icon: Zap,
            color: '#22c55e',
          }),
          _jsx(StatCard, {
            label: t('pruning.stats.clustersFound'),
            value: metrics?.total_clusters_found ?? 0,
            icon: Layers,
            color: '#eab308',
          }),
          _jsx(StatCard, {
            label: t('pruning.stats.lastCycle'),
            value: metrics?.last_cycle_duration_ms
              ? `${metrics.last_cycle_duration_ms}ms`
              : '—',
            icon: Clock,
            color: '#06b6d4',
          }),
        ],
      }),
      _jsx(AnimatePresence, {
        children:
          showConfig &&
          config &&
          _jsx(motion.div, {
            initial: { height: 0, opacity: 0 },
            animate: { height: 'auto', opacity: 1 },
            exit: { height: 0, opacity: 0 },
            style: {
              background: '#1a1a2e',
              border: '1px solid #2a2a4e',
              borderRadius: '12px',
              marginBottom: '24px',
              overflow: 'hidden',
            },
            children: _jsxs('div', {
              style: { padding: '20px' },
              children: [
                _jsx('h3', {
                  style: {
                    margin: '0 0 16px',
                    fontSize: '15px',
                    color: '#e0e0ff',
                  },
                  children: t('pruning.configTitle'),
                }),
                _jsxs('div', {
                  style: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '16px',
                  },
                  children: [
                    _jsxs('label', {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#a0a0c0',
                        fontSize: '13px',
                        cursor: 'pointer',
                      },
                      children: [
                        _jsx('input', {
                          type: 'checkbox',
                          checked: config.enabled,
                          onChange: (e) =>
                            updateConfig.mutate({ enabled: e.target.checked }),
                          style: { accentColor: '#a855f7' },
                        }),
                        t('pruning.autoPruning'),
                      ],
                    }),
                    _jsxs('div', {
                      children: [
                        _jsxs('label', {
                          htmlFor: 'prune-similarity',
                          style: {
                            fontSize: '12px',
                            color: '#8b8ba7',
                            display: 'block',
                            marginBottom: '4px',
                          },
                          children: [
                            t('pruning.similarityThreshold'),
                            ':',
                            ' ',
                            (config.similarity_threshold * 100).toFixed(0),
                            '%',
                          ],
                        }),
                        _jsx('input', {
                          id: 'prune-similarity',
                          type: 'range',
                          min: '50',
                          max: '99',
                          value: config.similarity_threshold * 100,
                          onChange: (e) =>
                            updateConfig.mutate({
                              similarity_threshold:
                                Number(e.target.value) / 100,
                            }),
                          style: { width: '100%', accentColor: '#a855f7' },
                        }),
                      ],
                    }),
                    _jsxs('div', {
                      children: [
                        _jsxs('label', {
                          htmlFor: 'prune-min-age',
                          style: {
                            fontSize: '12px',
                            color: '#8b8ba7',
                            display: 'block',
                            marginBottom: '4px',
                          },
                          children: [
                            t('pruning.minAge'),
                            ': ',
                            config.min_age_hours,
                          ],
                        }),
                        _jsx('input', {
                          id: 'prune-min-age',
                          type: 'range',
                          min: '0',
                          max: '168',
                          value: config.min_age_hours,
                          onChange: (e) =>
                            updateConfig.mutate({
                              min_age_hours: Number(e.target.value),
                            }),
                          style: { width: '100%', accentColor: '#a855f7' },
                        }),
                      ],
                    }),
                    _jsxs('div', {
                      children: [
                        _jsxs('label', {
                          htmlFor: 'prune-max-entries',
                          style: {
                            fontSize: '12px',
                            color: '#8b8ba7',
                            display: 'block',
                            marginBottom: '4px',
                          },
                          children: [
                            t('pruning.maxEntries'),
                            ': ',
                            config.max_memory_entries,
                          ],
                        }),
                        _jsx('input', {
                          id: 'prune-max-entries',
                          type: 'number',
                          min: '10',
                          max: '10000',
                          value: config.max_memory_entries,
                          onChange: (e) =>
                            updateConfig.mutate({
                              max_memory_entries: Number(e.target.value),
                            }),
                          style: {
                            width: '100%',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #2a2a4e',
                            background: '#0d0d1a',
                            color: '#e0e0ff',
                            fontSize: '13px',
                          },
                        }),
                      ],
                    }),
                    _jsxs('div', {
                      children: [
                        _jsxs('label', {
                          htmlFor: 'prune-interval',
                          style: {
                            fontSize: '12px',
                            color: '#8b8ba7',
                            display: 'block',
                            marginBottom: '4px',
                          },
                          children: [
                            t('pruning.autoInterval'),
                            ':',
                            ' ',
                            config.auto_prune_interval_secs,
                          ],
                        }),
                        _jsx('input', {
                          id: 'prune-interval',
                          type: 'number',
                          min: '300',
                          max: '86400',
                          step: '300',
                          value: config.auto_prune_interval_secs,
                          onChange: (e) =>
                            updateConfig.mutate({
                              auto_prune_interval_secs: Number(e.target.value),
                            }),
                          style: {
                            width: '100%',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #2a2a4e',
                            background: '#0d0d1a',
                            color: '#e0e0ff',
                            fontSize: '13px',
                          },
                        }),
                      ],
                    }),
                    _jsxs('div', {
                      children: [
                        _jsxs('label', {
                          htmlFor: 'prune-max-cluster',
                          style: {
                            fontSize: '12px',
                            color: '#8b8ba7',
                            display: 'block',
                            marginBottom: '4px',
                          },
                          children: [
                            t('pruning.maxCluster'),
                            ': ',
                            config.max_cluster_size,
                          ],
                        }),
                        _jsx('input', {
                          id: 'prune-max-cluster',
                          type: 'range',
                          min: '2',
                          max: '20',
                          value: config.max_cluster_size,
                          onChange: (e) =>
                            updateConfig.mutate({
                              max_cluster_size: Number(e.target.value),
                            }),
                          style: { width: '100%', accentColor: '#a855f7' },
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          }),
      }),
      _jsxs('div', {
        style: {
          background: '#1a1a2e',
          border: '1px solid #2a2a4e',
          borderRadius: '12px',
        },
        children: [
          _jsx('div', {
            style: { padding: '16px 20px', borderBottom: '1px solid #2a2a4e' },
            children: _jsx('h3', {
              style: { margin: 0, fontSize: '15px', color: '#e0e0ff' },
              children: t('pruning.history'),
            }),
          }),
          statsLoading
            ? _jsxs('div', {
                style: {
                  padding: '40px',
                  textAlign: 'center',
                  color: '#8b8ba7',
                },
                children: [
                  _jsx(Loader2, {
                    width: 24,
                    height: 24,
                    className: 'animate-spin',
                    style: { margin: '0 auto 8px' },
                  }),
                  _jsx('div', { children: t('pruning.loading') }),
                ],
              })
            : cycles.length === 0
              ? _jsxs('div', {
                  style: {
                    padding: '40px',
                    textAlign: 'center',
                    color: '#6b7280',
                  },
                  children: [
                    _jsx(Brain, {
                      width: 32,
                      height: 32,
                      style: { margin: '0 auto 8px', opacity: 0.3 },
                    }),
                    _jsx('div', { children: t('pruning.noCycles') }),
                    _jsx('div', {
                      style: { fontSize: '12px', marginTop: '4px' },
                      children: t('pruning.noCyclesHint'),
                    }),
                  ],
                })
              : _jsx('div', {
                  style: { maxHeight: '500px', overflowY: 'auto' },
                  children: cycles.map((cycle) => {
                    const isExpanded = expandedCycle === cycle.id;
                    return _jsxs(
                      'div',
                      {
                        children: [
                          _jsxs('button', {
                            type: 'button',
                            onClick: () =>
                              setExpandedCycle(isExpanded ? null : cycle.id),
                            style: {
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '12px 20px',
                              borderBottom: '1px solid #1a1a2e',
                              background: isExpanded
                                ? '#1f1f3a'
                                : 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              textAlign: 'left',
                              color: '#e0e0ff',
                              fontSize: '13px',
                            },
                            children: [
                              isExpanded
                                ? _jsx(ChevronDown, { width: 14, height: 14 })
                                : _jsx(ChevronRight, { width: 14, height: 14 }),
                              _jsx(StatusBadge, { status: cycle.status }),
                              _jsx('span', {
                                style: {
                                  fontFamily: 'monospace',
                                  fontSize: '11px',
                                  color: '#8b8ba7',
                                },
                                children: new Date(
                                  cycle.started_at,
                                ).toLocaleString('pl-PL'),
                              }),
                              _jsx('span', { style: { flex: 1 } }),
                              _jsxs('span', {
                                style: {
                                  display: 'flex',
                                  gap: '16px',
                                  fontSize: '12px',
                                  color: '#a0a0c0',
                                },
                                children: [
                                  _jsxs('span', {
                                    title: t('pruning.tooltips.deleted'),
                                    children: [
                                      _jsx(Trash2, {
                                        width: 12,
                                        height: 12,
                                        style: {
                                          marginRight: '2px',
                                          verticalAlign: 'middle',
                                        },
                                      }),
                                      cycle.deleted_count,
                                    ],
                                  }),
                                  _jsxs('span', {
                                    title: t('pruning.tooltips.merged'),
                                    children: [
                                      _jsx(GitMerge, {
                                        width: 12,
                                        height: 12,
                                        style: {
                                          marginRight: '2px',
                                          verticalAlign: 'middle',
                                        },
                                      }),
                                      cycle.merged_count,
                                    ],
                                  }),
                                  _jsxs('span', {
                                    title: t('pruning.tooltips.kept'),
                                    children: [
                                      _jsx(CheckCircle2, {
                                        width: 12,
                                        height: 12,
                                        style: {
                                          marginRight: '2px',
                                          verticalAlign: 'middle',
                                        },
                                      }),
                                      cycle.kept_count,
                                    ],
                                  }),
                                  _jsxs('span', {
                                    title: t('pruning.tooltips.tokensSaved'),
                                    style: { color: '#4ade80' },
                                    children: [
                                      _jsx(Zap, {
                                        width: 12,
                                        height: 12,
                                        style: {
                                          marginRight: '2px',
                                          verticalAlign: 'middle',
                                        },
                                      }),
                                      cycle.tokens_saved.toLocaleString(),
                                    ],
                                  }),
                                ],
                              }),
                              _jsx('span', {
                                style: { fontSize: '11px', color: '#6b7280' },
                                children: cycle.triggered_by,
                              }),
                            ],
                          }),
                          _jsx(AnimatePresence, {
                            children:
                              isExpanded &&
                              _jsx(motion.div, {
                                initial: { height: 0, opacity: 0 },
                                animate: { height: 'auto', opacity: 1 },
                                exit: { height: 0, opacity: 0 },
                                style: {
                                  overflow: 'hidden',
                                  background: '#14142a',
                                  borderBottom: '1px solid #2a2a4e',
                                },
                                children: _jsxs('div', {
                                  style: { padding: '8px 20px' },
                                  children: [
                                    cycle.error &&
                                      _jsxs('div', {
                                        style: {
                                          padding: '8px 12px',
                                          marginBottom: '8px',
                                          borderRadius: '6px',
                                          background: '#ef444420',
                                          color: '#f87171',
                                          fontSize: '12px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                        },
                                        children: [
                                          _jsx(XCircle, {
                                            width: 14,
                                            height: 14,
                                          }),
                                          cycle.error,
                                        ],
                                      }),
                                    _jsx(CycleDetails, { cycleId: cycle.id }),
                                  ],
                                }),
                              }),
                          }),
                        ],
                      },
                      cycle.id,
                    );
                  }),
                }),
        ],
      }),
    ],
  });
}
