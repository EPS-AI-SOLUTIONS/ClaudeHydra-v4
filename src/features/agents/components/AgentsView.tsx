/**
 * AgentsView — 12 Witcher Agent Grid
 * ====================================
 * Displays all 12 Witcher-themed AI agents in a responsive grid layout.
 * Each card shows: name, role, tier, status, description.
 * Filter by tier (Commander / Coordinator / Executor).
 *
 * Ported from ClaudeHydra v3 `web/src/app/agents/page.tsx` and expanded
 * with tier system, status indicators, and glass card styling.
 */

import { Bot, Brain, Crown, Filter, GitBranch, Shield, Swords, Users, Wand2, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useMemo, useState } from 'react';
import { Badge, Button, Card } from '@/components/atoms';
import { StatusIndicator, type StatusState } from '@/components/molecules';
import { cn } from '@/shared/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentTier = 'Commander' | 'Coordinator' | 'Executor';

interface WitcherAgent {
  id: string;
  name: string;
  role: string;
  tier: AgentTier;
  status: StatusState;
  description: string;
  icon: typeof Shield;
  color: string;
}

type TierFilter = AgentTier | 'All';

// ---------------------------------------------------------------------------
// Agent Data
// ---------------------------------------------------------------------------

const WITCHER_AGENTS: readonly WitcherAgent[] = [
  {
    id: 'geralt',
    name: 'Geralt',
    role: 'Security & Protection',
    tier: 'Commander',
    status: 'online',
    description: 'Project security, input validation, code audits, and threat mitigation.',
    icon: Shield,
    color: 'text-amber-400',
  },
  {
    id: 'yennefer',
    name: 'Yennefer',
    role: 'Architecture & Design',
    tier: 'Commander',
    status: 'online',
    description: 'System architecture, design patterns, refactoring, and structural integrity.',
    icon: Wand2,
    color: 'text-purple-400',
  },
  {
    id: 'triss',
    name: 'Triss',
    role: 'Frontend & UX',
    tier: 'Coordinator',
    status: 'online',
    description: 'UI components, accessibility, responsiveness, and user experience.',
    icon: Zap,
    color: 'text-pink-400',
  },
  {
    id: 'jaskier',
    name: 'Jaskier',
    role: 'Documentation & Comms',
    tier: 'Coordinator',
    status: 'pending',
    description: 'Documentation, README, changelog, communication, and knowledge base.',
    icon: Bot,
    color: 'text-yellow-400',
  },
  {
    id: 'vesemir',
    name: 'Vesemir',
    role: 'Code Review & Mentoring',
    tier: 'Commander',
    status: 'online',
    description: 'Code review, best practices enforcement, mentoring, and quality gates.',
    icon: Brain,
    color: 'text-blue-400',
  },
  {
    id: 'ciri',
    name: 'Ciri',
    role: 'Innovation & Experiments',
    tier: 'Coordinator',
    status: 'online',
    description: 'Emerging technologies, rapid prototyping, and experimental features.',
    icon: Wand2,
    color: 'text-emerald-400',
  },
  {
    id: 'dijkstra',
    name: 'Dijkstra',
    role: 'Intelligence & Research',
    tier: 'Coordinator',
    status: 'online',
    description: 'Data analysis, competitive research, and technological intelligence.',
    icon: Bot,
    color: 'text-indigo-400',
  },
  {
    id: 'lambert',
    name: 'Lambert',
    role: 'Testing & QA',
    tier: 'Executor',
    status: 'online',
    description: 'Unit tests, integration tests, E2E testing, and quality assurance.',
    icon: Swords,
    color: 'text-red-400',
  },
  {
    id: 'eskel',
    name: 'Eskel',
    role: 'DevOps & Infrastructure',
    tier: 'Executor',
    status: 'pending',
    description: 'CI/CD pipelines, Docker, deployment automation, and monitoring.',
    icon: GitBranch,
    color: 'text-green-400',
  },
  {
    id: 'regis',
    name: 'Regis',
    role: 'Analysis & Strategy',
    tier: 'Coordinator',
    status: 'online',
    description: 'Deep analysis, strategic planning, and long-term decision support.',
    icon: Brain,
    color: 'text-cyan-400',
  },
  {
    id: 'zoltan',
    name: 'Zoltan',
    role: 'Performance & Optimization',
    tier: 'Executor',
    status: 'online',
    description: 'Performance tuning, profiling, caching strategies, and optimization.',
    icon: Swords,
    color: 'text-orange-400',
  },
  {
    id: 'philippa',
    name: 'Philippa',
    role: 'API & Integration',
    tier: 'Executor',
    status: 'offline',
    description: 'API design, protocol handling, middleware, and third-party integrations.',
    icon: Zap,
    color: 'text-violet-400',
  },
] as const;

// ---------------------------------------------------------------------------
// Tier Metadata
// ---------------------------------------------------------------------------

const TIER_FILTERS: readonly TierFilter[] = ['All', 'Commander', 'Coordinator', 'Executor'] as const;

const tierBadgeVariant: Record<AgentTier, 'accent' | 'warning' | 'default'> = {
  Commander: 'accent',
  Coordinator: 'warning',
  Executor: 'default',
};

const tierIcon: Record<AgentTier, typeof Crown> = {
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
    transition: { type: 'spring' as const, stiffness: 300, damping: 25 },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
};

// ---------------------------------------------------------------------------
// AgentCard Sub-component
// ---------------------------------------------------------------------------

interface AgentCardProps {
  agent: WitcherAgent;
}

function AgentCard({ agent }: AgentCardProps) {
  const Icon = agent.icon;
  const TierIcon = tierIcon[agent.tier];

  return (
    <motion.div data-testid={`agent-card-${agent.id}`} variants={cardVariants} layout layoutId={agent.id}>
      <Card variant="hover" padding="none" interactive className="h-full">
        <div className="p-4 space-y-3">
          {/* Header: Icon + Name + Status */}
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                'bg-[var(--matrix-bg-secondary)] border border-[var(--matrix-border)]',
                agent.color,
              )}
            >
              <Icon size={20} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--matrix-text-primary)] truncate">{agent.name}</h3>
                <StatusIndicator status={agent.status} size="sm" />
              </div>
              <p className="text-[11px] text-[var(--matrix-text-secondary)] truncate">{agent.role}</p>
            </div>
          </div>

          {/* Description */}
          <p className="text-xs text-[var(--matrix-text-secondary)] leading-relaxed line-clamp-2">
            {agent.description}
          </p>

          {/* Footer: Tier Badge + Status Label */}
          <div className="flex items-center justify-between pt-1">
            <Badge variant={tierBadgeVariant[agent.tier]} size="sm" icon={<TierIcon size={10} />}>
              {agent.tier}
            </Badge>

            <StatusIndicator status={agent.status} size="sm" label={agent.status} />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// AgentsView Component
// ---------------------------------------------------------------------------

export function AgentsView() {
  const [activeTier, setActiveTier] = useState<TierFilter>('All');

  const filteredAgents = useMemo(() => {
    if (activeTier === 'All') return WITCHER_AGENTS;
    return WITCHER_AGENTS.filter((a) => a.tier === activeTier);
  }, [activeTier]);

  const tierCounts = useMemo(() => {
    const counts: Record<TierFilter, number> = {
      All: WITCHER_AGENTS.length,
      Commander: 0,
      Coordinator: 0,
      Executor: 0,
    };
    for (const agent of WITCHER_AGENTS) {
      counts[agent.tier]++;
    }
    return counts;
  }, []);

  const onlineCount = useMemo(() => WITCHER_AGENTS.filter((a) => a.status === 'online').length, []);

  const handleTierFilter = useCallback((tier: TierFilter) => {
    setActiveTier(tier);
  }, []);

  return (
    <div data-testid="agents-view" className="h-full flex flex-col overflow-auto p-4 sm:p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-[var(--matrix-accent)]/10 border border-[var(--matrix-accent)]/20 flex items-center justify-center">
            <Users size={20} className="text-[var(--matrix-accent)]" />
          </div>
          <div>
            <h2 data-testid="agents-header" className="text-lg font-semibold text-[var(--matrix-accent)] text-glow-subtle">Witcher Agent Swarm</h2>
            <p data-testid="agents-online-count" className="text-xs text-[var(--matrix-text-secondary)]">
              {onlineCount} of {WITCHER_AGENTS.length} agents online
            </p>
          </div>
        </div>

        <p className="text-sm text-[var(--matrix-text-secondary)] mb-4">
          12 specialized AI agents managed by ClaudeHydra, organized in a hierarchical swarm structure.
        </p>

        {/* Tier Filter Buttons */}
        <div data-testid="agents-filter-bar" className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-[var(--matrix-text-secondary)]" />
          {TIER_FILTERS.map((tier) => (
            <Button
              key={tier}
              data-testid={`agents-filter-${tier.toLowerCase()}`}
              variant={activeTier === tier ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => handleTierFilter(tier)}
            >
              {tier}
              <span className="ml-1 opacity-70">({tierCounts[tier]})</span>
            </Button>
          ))}
        </div>
      </motion.div>

      {/* Agent Grid */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={activeTier}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          data-testid="agents-grid"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </motion.div>
      </AnimatePresence>

      {/* Empty State */}
      {filteredAgents.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 flex items-center justify-center"
        >
          <div className="text-center py-12">
            <Users size={40} className="mx-auto text-[var(--matrix-text-secondary)] opacity-30 mb-3" />
            <p className="text-sm text-[var(--matrix-text-secondary)]">No agents match the selected tier filter.</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default AgentsView;
