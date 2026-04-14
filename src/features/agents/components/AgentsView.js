/**
 * AgentsView — 12 Claude AI Agent Grid
 * ======================================
 * Displays all 12 Claude AI model agents in a responsive grid layout.
 * Each card shows: name, role, tier, status, description.
 * Filter by tier (Commander / Coordinator / Executor).
 *
 * Commander tier = Claude Opus 4.6 (strategic, deep reasoning)
 * Coordinator tier = Claude Sonnet 4.5 (balanced, versatile)
 * Executor tier = Claude Haiku 4.5 (fast, efficient)
 */
import {
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  ErrorBoundary,
} from '@jaskier/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { StatusIndicator } from '@/components/molecules/StatusIndicator';
import { useBackendLogs } from '@/features/logs/hooks/useLogs';
import Bot from '~icons/lucide/bot';
import Brain from '~icons/lucide/brain';
import Crown from '~icons/lucide/crown';
import Filter from '~icons/lucide/filter';
import GitBranch from '~icons/lucide/git-branch';
import Shield from '~icons/lucide/shield';
import Swords from '~icons/lucide/swords';
import TerminalIcon from '~icons/lucide/terminal';
import Users from '~icons/lucide/users';
import Wand2 from '~icons/lucide/wand-2';
import Zap from '~icons/lucide/zap';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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
function levelBadgeClasses(level) {
  const l = level.toUpperCase();
  if (l === 'ERROR') return 'text-red-400';
  if (l === 'WARN') return 'text-amber-400';
  if (l === 'INFO') return 'text-blue-400';
  return 'text-gray-400';
}
// ---------------------------------------------------------------------------
// Agent Data
// ---------------------------------------------------------------------------
const CLAUDE_AGENTS = [
  {
    id: 'opus-sentinel',
    name: 'Opus Sentinel',
    model: 'claude-opus-4-6',
    role: 'Security & Protection',
    tier: 'Commander',
    status: 'online',
    description:
      'Deep reasoning for security audits, threat modeling, vulnerability analysis, and code safety.',
    icon: Shield,
    color: 'text-amber-400',
  },
  {
    id: 'opus-architect',
    name: 'Opus Architect',
    model: 'claude-opus-4-6',
    role: 'Architecture & Design',
    tier: 'Commander',
    status: 'online',
    description:
      'System architecture, design patterns, complex refactoring, and structural integrity analysis.',
    icon: Wand2,
    color: 'text-purple-400',
  },
  {
    id: 'opus-mentor',
    name: 'Opus Mentor',
    model: 'claude-opus-4-6',
    role: 'Code Review & Mentoring',
    tier: 'Commander',
    status: 'online',
    description:
      'In-depth code review, best practices enforcement, mentoring, and quality gates.',
    icon: Brain,
    color: 'text-blue-400',
  },
  {
    id: 'sonnet-frontend',
    name: 'Sonnet Frontend',
    model: 'claude-sonnet-4-6',
    role: 'Frontend & UX',
    tier: 'Coordinator',
    status: 'online',
    description:
      'UI components, accessibility, responsive design, and user experience optimization.',
    icon: Zap,
    color: 'text-pink-400',
  },
  {
    id: 'sonnet-docs',
    name: 'Sonnet Docs',
    model: 'claude-sonnet-4-6',
    role: 'Documentation & Comms',
    tier: 'Coordinator',
    status: 'online',
    description:
      'Documentation, README, changelog, technical writing, and knowledge base maintenance.',
    icon: Bot,
    color: 'text-yellow-400',
  },
  {
    id: 'sonnet-research',
    name: 'Sonnet Research',
    model: 'claude-sonnet-4-6',
    role: 'Intelligence & Research',
    tier: 'Coordinator',
    status: 'online',
    description:
      'Data analysis, competitive research, trend analysis, and technological intelligence.',
    icon: Bot,
    color: 'text-indigo-400',
  },
  {
    id: 'sonnet-innovator',
    name: 'Sonnet Innovator',
    model: 'claude-sonnet-4-6',
    role: 'Innovation & Experiments',
    tier: 'Coordinator',
    status: 'online',
    description:
      'Emerging technologies, rapid prototyping, PoC development, and experimental features.',
    icon: Wand2,
    color: 'text-emerald-400',
  },
  {
    id: 'sonnet-strategist',
    name: 'Sonnet Strategist',
    model: 'claude-sonnet-4-6',
    role: 'Analysis & Strategy',
    tier: 'Coordinator',
    status: 'online',
    description:
      'Deep analysis, strategic planning, risk assessment, and long-term decision support.',
    icon: Brain,
    color: 'text-cyan-400',
  },
  {
    id: 'haiku-tester',
    name: 'Haiku Tester',
    model: 'claude-haiku-4-5',
    role: 'Testing & QA',
    tier: 'Executor',
    status: 'online',
    description:
      'Fast unit tests, integration tests, E2E testing, and automated quality assurance.',
    icon: Swords,
    color: 'text-red-400',
  },
  {
    id: 'haiku-devops',
    name: 'Haiku DevOps',
    model: 'claude-haiku-4-5',
    role: 'DevOps & Infrastructure',
    tier: 'Executor',
    status: 'online',
    description:
      'CI/CD pipelines, Docker orchestration, deployment automation, and health monitoring.',
    icon: GitBranch,
    color: 'text-green-400',
  },
  {
    id: 'haiku-optimizer',
    name: 'Haiku Optimizer',
    model: 'claude-haiku-4-5',
    role: 'Performance & Optimization',
    tier: 'Executor',
    status: 'online',
    description:
      'Bundle profiling, caching strategies, lazy loading, and runtime performance tuning.',
    icon: Swords,
    color: 'text-orange-400',
  },
  {
    id: 'haiku-integrator',
    name: 'Haiku Integrator',
    model: 'claude-haiku-4-5',
    role: 'API & Integration',
    tier: 'Executor',
    status: 'online',
    description:
      'API design, protocol handling, middleware pipelines, and third-party integrations.',
    icon: Zap,
    color: 'text-violet-400',
  },
];
// ---------------------------------------------------------------------------
// Tier Metadata
// ---------------------------------------------------------------------------
const TIER_FILTERS = ['All', 'Commander', 'Coordinator', 'Executor'];
const tierBadgeVariant = {
  Commander: 'accent',
  Coordinator: 'warning',
  Executor: 'default',
};
const tierIcon = {
  Commander: Crown,
  Coordinator: Users,
  Executor: Swords,
};
// ---------------------------------------------------------------------------
// Animation Variants
// ---------------------------------------------------------------------------
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};
const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 25 },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
};
function AgentCard({ agent }) {
  const Icon = agent.icon;
  const TierIcon = tierIcon[agent.tier];
  return _jsx(motion.div, {
    'data-testid': `agent-card-${agent.id}`,
    variants: cardVariants,
    layout: true,
    layoutId: agent.id,
    children: _jsx(Card, {
      variant: 'hover',
      padding: 'none',
      interactive: true,
      className: 'h-full',
      children: _jsxs('div', {
        className: 'p-4 space-y-3',
        children: [
          _jsxs('div', {
            className: 'flex items-start gap-3',
            children: [
              _jsx('div', {
                className: cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                  'bg-[var(--matrix-bg-secondary)] border border-[var(--matrix-border)]',
                  agent.color,
                ),
                children: _jsx(Icon, { width: 20, height: 20 }),
              }),
              _jsxs('div', {
                className: 'flex-1 min-w-0',
                children: [
                  _jsxs('div', {
                    className: 'flex items-center gap-2',
                    children: [
                      _jsx('h3', {
                        className:
                          'text-sm font-semibold text-[var(--matrix-text-primary)] truncate',
                        children: agent.name,
                      }),
                      _jsx(StatusIndicator, {
                        status: agent.status,
                        size: 'sm',
                      }),
                    ],
                  }),
                  _jsx('p', {
                    className:
                      'text-[11px] text-[var(--matrix-text-secondary)] truncate',
                    children: agent.role,
                  }),
                  _jsx('p', {
                    className:
                      'text-[10px] text-[var(--matrix-accent)]/60 font-mono truncate',
                    children: agent.model,
                  }),
                ],
              }),
            ],
          }),
          _jsx('p', {
            className:
              'text-xs text-[var(--matrix-text-secondary)] leading-relaxed line-clamp-2',
            children: agent.description,
          }),
          _jsxs('div', {
            className: 'flex items-center justify-between pt-1',
            children: [
              _jsx(Badge, {
                variant: tierBadgeVariant[agent.tier],
                size: 'sm',
                icon: _jsx(TierIcon, { width: 10, height: 10 }),
                children: agent.tier,
              }),
              _jsx(StatusIndicator, {
                status: agent.status,
                size: 'sm',
                label: agent.status,
              }),
            ],
          }),
        ],
      }),
    }),
  });
}
// ---------------------------------------------------------------------------
// AgentsView Component
// ---------------------------------------------------------------------------
export function AgentsView() {
  const { t } = useTranslation();
  const [activeTier, setActiveTier] = useState('All');
  // Real-time terminal logs state
  const { data, isLoading } = useBackendLogs({ limit: 50 }, true);
  const logs = data?.logs ?? [];
  const filteredAgents = useMemo(() => {
    if (activeTier === 'All') return CLAUDE_AGENTS;
    return CLAUDE_AGENTS.filter((a) => a.tier === activeTier);
  }, [activeTier]);
  const tierCounts = useMemo(() => {
    const counts = {
      All: CLAUDE_AGENTS.length,
      Commander: 0,
      Coordinator: 0,
      Executor: 0,
    };
    for (const agent of CLAUDE_AGENTS) {
      counts[agent.tier]++;
    }
    return counts;
  }, []);
  const onlineCount = useMemo(
    () => CLAUDE_AGENTS.filter((a) => a.status === 'online').length,
    [],
  );
  return _jsx(ErrorBoundary, {
    children: _jsxs('div', {
      'data-testid': 'agents-view',
      className:
        'h-full flex flex-col xl:flex-row gap-4 overflow-hidden p-4 sm:p-6',
      children: [
        _jsxs('div', {
          className: 'flex-1 flex flex-col overflow-auto pr-2',
          children: [
            _jsxs(motion.div, {
              initial: { opacity: 0, y: -10 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.3 },
              className: 'mb-6 shrink-0',
              children: [
                _jsxs('div', {
                  className: 'flex items-center gap-3 mb-2',
                  children: [
                    _jsx('div', {
                      className:
                        'w-10 h-10 rounded-lg bg-[var(--matrix-accent)]/10 border border-[var(--matrix-accent)]/20 flex items-center justify-center',
                      children: _jsx(Users, {
                        width: 20,
                        height: 20,
                        className: 'text-[var(--matrix-accent)]',
                      }),
                    }),
                    _jsxs('div', {
                      children: [
                        _jsx('h2', {
                          'data-testid': 'agents-header',
                          className:
                            'text-lg font-semibold text-[var(--matrix-accent)] text-glow-subtle',
                          children: 'Claude AI Agent Swarm',
                        }),
                        _jsxs('p', {
                          'data-testid': 'agents-online-count',
                          className:
                            'text-xs text-[var(--matrix-text-secondary)]',
                          children: [
                            onlineCount,
                            ' of ',
                            CLAUDE_AGENTS.length,
                            ' agents online',
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
                _jsx('p', {
                  className: 'text-sm text-[var(--matrix-text-secondary)] mb-4',
                  children:
                    '12 specialized Claude AI agents \u2014 Opus, Sonnet & Haiku \u2014 organized in a hierarchical swarm structure.',
                }),
                _jsxs('div', {
                  'data-testid': 'agents-filter-bar',
                  className: 'flex items-center gap-2 flex-wrap',
                  children: [
                    _jsx(Filter, {
                      width: 14,
                      height: 14,
                      className: 'text-[var(--matrix-text-secondary)]',
                    }),
                    TIER_FILTERS.map((tier) =>
                      _jsxs(
                        Button,
                        {
                          'data-testid': `agents-filter-${tier.toLowerCase()}`,
                          variant:
                            activeTier === tier ? 'primary' : 'secondary',
                          size: 'sm',
                          onClick: () => setActiveTier(tier),
                          children: [
                            tier,
                            _jsxs('span', {
                              className: 'ml-1 opacity-70',
                              children: ['(', tierCounts[tier], ')'],
                            }),
                          ],
                        },
                        tier,
                      ),
                    ),
                  ],
                }),
              ],
            }),
            _jsxs('div', {
              className: 'flex-1 overflow-auto',
              children: [
                _jsx(AnimatePresence, {
                  mode: 'popLayout',
                  children: _jsx(
                    motion.div,
                    {
                      variants: containerVariants,
                      initial: 'hidden',
                      animate: 'visible',
                      'data-testid': 'agents-grid',
                      className:
                        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-4',
                      children: filteredAgents.map((agent) =>
                        _jsx(AgentCard, { agent: agent }, agent.id),
                      ),
                    },
                    activeTier,
                  ),
                }),
                filteredAgents.length === 0 &&
                  _jsx(EmptyState, {
                    icon: _jsx(Users, {}),
                    title: t(
                      'agents.noMatch',
                      'No agents match the selected filter',
                    ),
                    description: t(
                      'agents.noMatchDesc',
                      'Try selecting a different tier filter to see agents.',
                    ),
                    className: 'flex-1',
                  }),
              ],
            }),
          ],
        }),
        _jsxs('div', {
          className:
            'w-full xl:w-96 h-64 xl:h-full shrink-0 flex flex-col border border-[var(--matrix-border)] rounded-xl bg-[var(--matrix-bg-secondary)] overflow-hidden shadow-lg',
          children: [
            _jsxs('div', {
              className:
                'flex items-center gap-2 p-3 border-b border-[var(--matrix-border)] bg-black/20',
              children: [
                _jsx(TerminalIcon, {
                  width: 16,
                  height: 16,
                  className: 'text-[var(--matrix-accent)]',
                }),
                _jsx('h3', {
                  className:
                    'text-sm font-mono font-semibold text-[var(--matrix-text-primary)]',
                  children: 'Agents Terminal',
                }),
                isLoading &&
                  _jsx('span', {
                    className:
                      'ml-auto text-xs text-[var(--matrix-text-secondary)] animate-pulse',
                    children: 'Loading...',
                  }),
              ],
            }),
            _jsxs('div', {
              className:
                'flex-1 overflow-y-auto p-3 space-y-1.5 font-mono text-[10px] sm:text-xs bg-black/40',
              children: [
                logs.length === 0 &&
                  !isLoading &&
                  _jsx('div', {
                    className: 'text-[var(--matrix-text-secondary)] italic',
                    children: 'Awaiting logs...',
                  }),
                logs.map((entry, i) =>
                  _jsxs(
                    'div',
                    {
                      className: 'flex items-start gap-2 break-all',
                      children: [
                        _jsx('span', {
                          className:
                            'text-[var(--matrix-text-secondary)] opacity-50 shrink-0',
                          children: formatTimestamp(entry.timestamp),
                        }),
                        _jsxs('span', {
                          className: cn(
                            'shrink-0 font-semibold',
                            levelBadgeClasses(entry.level),
                          ),
                          children: ['[', entry.level, ']'],
                        }),
                        _jsxs('span', {
                          className: 'text-[var(--matrix-text-primary)]',
                          children: [
                            _jsxs('span', {
                              className:
                                'text-[var(--matrix-accent)] opacity-70 mr-1',
                              children: [entry.target, ':'],
                            }),
                            entry.message,
                          ],
                        }),
                      ],
                    },
                    `${entry.timestamp}-${i}`,
                  ),
                ),
              ],
            }),
          ],
        }),
      ],
    }),
  });
}
export default AgentsView;
