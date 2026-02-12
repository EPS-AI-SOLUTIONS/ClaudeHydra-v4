/**
 * HomePage — ClaudeHydra v4 landing / home view.
 * Ported from ClaudeHydra v3 `web/src/app/page.tsx`.
 *
 * Centered glass card with Zap icon, version badge, feature badges,
 * CTA buttons, and Matrix Green theme with motion entrance animations.
 */

import { Bot, Brain, Cpu, MessageSquare, Network, Settings, Shield, Terminal, Users, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { useViewStore } from '@/stores/viewStore';

// ---------------------------------------------------------------------------
// Feature badge data
// ---------------------------------------------------------------------------

interface FeatureBadgeItem {
  label: string;
  icon: React.ReactNode;
}

const FEATURE_BADGES: FeatureBadgeItem[] = [
  { label: '12 Agents', icon: <Users size={12} /> },
  { label: 'Claude + Ollama', icon: <Bot size={12} /> },
  { label: 'MCP Integration', icon: <Network size={12} /> },
  { label: 'Streaming Chat', icon: <MessageSquare size={12} /> },
  { label: 'Swarm AI', icon: <Brain size={12} /> },
  { label: 'Local LLMs', icon: <Cpu size={12} /> },
];

// ---------------------------------------------------------------------------
// Feature card data
// ---------------------------------------------------------------------------

interface FeatureCardItem {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FEATURE_CARDS: FeatureCardItem[] = [
  {
    icon: <Brain className="w-5 h-5" />,
    title: 'Swarm AI',
    description: '12 Witcher agents',
  },
  {
    icon: <Terminal className="w-5 h-5" />,
    title: 'Ollama',
    description: 'Local LLM models',
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: 'MCP Bridge',
    description: 'Claude integration',
  },
];

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
  },
};

const iconVariants = {
  hidden: { opacity: 0, scale: 0.5, rotate: -20 },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { type: 'spring' as const, stiffness: 400, damping: 20 },
  },
};

// ---------------------------------------------------------------------------
// FeatureCard sub-component
// ---------------------------------------------------------------------------

function FeatureCard({ icon, title, description }: FeatureCardItem) {
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -2, scale: 1.02 }}
      className="glass-panel p-4 text-center space-y-2 cursor-default hover:border-[var(--matrix-accent-dim)] transition-colors"
    >
      <div className="text-[var(--matrix-accent)] flex justify-center">{icon}</div>
      <h3 className="text-sm font-semibold text-[var(--matrix-text-primary)]">{title}</h3>
      <p className="text-xs text-[var(--matrix-text-secondary)]">{description}</p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// HomePage component
// ---------------------------------------------------------------------------

export function HomePage() {
  const { setView, createSession } = useViewStore();

  const handleStartChat = () => {
    createSession();
  };

  const handleViewAgents = () => {
    setView('agents');
  };

  const handleSettings = () => {
    setView('settings');
  };

  return (
    <div data-testid="home-view" className="flex flex-col items-center justify-center h-full bg-grid-pattern p-6 md:p-8 overflow-auto">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        data-testid="home-glass-card"
        className="glass-card max-w-2xl w-full p-8 text-center space-y-6"
      >
        {/* Logo + Title */}
        <motion.div variants={itemVariants} className="flex items-center justify-center gap-3">
          <motion.div
            variants={iconVariants}
            className="w-12 h-12 rounded-xl bg-[var(--matrix-accent)] flex items-center justify-center shadow-[0_0_20px_rgba(0,255,65,0.4)]"
          >
            <Zap className="w-7 h-7 text-[var(--matrix-bg-primary)]" />
          </motion.div>
          <h1 data-testid="home-title" className="text-3xl font-bold text-[var(--matrix-accent)] text-glow font-mono">ClaudeHydra</h1>
        </motion.div>

        {/* Subtitle */}
        <motion.p data-testid="home-subtitle" variants={itemVariants} className="text-[var(--matrix-text-secondary)] text-sm">
          AI Swarm Control Center
        </motion.p>

        {/* Version badge */}
        <motion.div data-testid="home-version-badge" variants={itemVariants}>
          <Badge variant="accent" size="sm" icon={<Zap size={10} />}>
            v4.0.0
          </Badge>
        </motion.div>

        {/* Feature badges */}
        <motion.div data-testid="home-feature-badges" variants={itemVariants} className="flex flex-wrap justify-center gap-2">
          {FEATURE_BADGES.map((badge) => (
            <Badge key={badge.label} variant="default" size="sm" icon={badge.icon}>
              {badge.label}
            </Badge>
          ))}
        </motion.div>

        {/* Feature cards grid */}
        <motion.div data-testid="home-feature-cards" variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          {FEATURE_CARDS.map((card) => (
            <FeatureCard key={card.title} icon={card.icon} title={card.title} description={card.description} />
          ))}
        </motion.div>

        {/* CTA buttons */}
        <motion.div variants={itemVariants} className="flex flex-wrap justify-center gap-3 mt-6">
          <Button data-testid="home-cta-start-chat" variant="primary" size="md" leftIcon={<MessageSquare size={16} />} onClick={handleStartChat}>
            Start Chat
          </Button>
          <Button data-testid="home-cta-view-agents" variant="secondary" size="md" leftIcon={<Users size={16} />} onClick={handleViewAgents}>
            View Agents
          </Button>
          <Button data-testid="home-cta-settings" variant="ghost" size="md" leftIcon={<Settings size={16} />} onClick={handleSettings}>
            Settings
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default HomePage;
