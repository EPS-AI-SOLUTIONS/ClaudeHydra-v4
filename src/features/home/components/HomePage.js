// src/features/home/components/HomePage.tsx
/**
 * ClaudeHydra v4 - WelcomeScreen (Home View)
 * =============================================
 * Centered hero card with logo, feature badges, CTA buttons, and recent sessions.
 * Pixel-perfect port of GeminiHydra WelcomeScreen layout with ClaudeHydra data.
 */
import { useViewTheme } from '@jaskier/chat-module';
import { Badge, Button, cn } from '@jaskier/ui';
import { Bot, Clock, MessageSquare, Network, Plus, Sparkles, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useMemo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { useSessionSync } from '@/features/chat/hooks/useSessionSync';
import { HealthDashboard } from '@/features/health/components/HealthDashboard';
import { PasskeyLoginSection } from '@/features/home/components/PasskeyLoginSection';
import { OAuthBanner } from '@/features/settings/components/OAuthBanner';
import { useViewStore } from '@/stores/viewStore';

// ============================================================================
// CONSTANTS
// ============================================================================
const FEATURE_BADGES = [
  { key: 'home.badges.agents', fallback: '12 Agents', icon: Users },
  { key: 'home.badges.claudeApi', fallback: 'Claude API', icon: Bot },
  { key: 'home.badges.mcpIntegration', fallback: 'MCP Integration', icon: Network },
  { key: 'home.badges.streamingChat', fallback: 'Streaming Chat', icon: MessageSquare },
];
const MAX_RECENT_SESSIONS = 5;
// ============================================================================
// HELPERS
// ============================================================================
function timeAgo(timestamp, t) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t('time.justNow', 'just now');
  if (minutes < 60) return t('time.minutesAgo', { defaultValue: '{{m}}m ago', m: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { defaultValue: '{{h}}h ago', h: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t('time.yesterday', 'yesterday');
  return t('time.daysAgo', { defaultValue: '{{d}}d ago', d: days });
}
// ============================================================================
// ANIMATION VARIANTS
// ============================================================================
const heroVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};
const ctaVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: 0.2 },
  },
};
const recentVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: 0.3 },
  },
};
const badgeContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.15 },
  },
};
const badgeItemVariants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1 },
};
const SessionRow = memo(({ session, onOpen, theme }) => {
  const { t } = useTranslation();
  return _jsxs(motion.button, {
    type: 'button',
    onClick: () => onOpen(session.id),
    className: cn(
      'w-full flex items-center gap-3 p-3 rounded-xl',
      'transition-all duration-200 group cursor-pointer text-left',
      theme.listItem,
      theme.listItemHover,
    ),
    whileHover: { x: 4 },
    whileTap: { scale: 0.98 },
    children: [
      _jsx(MessageSquare, {
        size: 16,
        className: cn('shrink-0 transition-colors', 'group-hover:text-[var(--matrix-accent)]', theme.iconMuted),
      }),
      _jsx('div', {
        className: 'flex-1 min-w-0',
        children: _jsx('p', {
          className: cn('text-sm truncate transition-colors', 'group-hover:text-[var(--matrix-accent)]', theme.text),
          children: session.title,
        }),
      }),
      _jsxs('div', {
        className: 'flex flex-col items-end shrink-0',
        children: [
          _jsx('span', {
            className: cn('text-[10px] font-mono', theme.textMuted),
            children: timeAgo(session.createdAt, t),
          }),
          (session.messageCount ?? 0) > 0 &&
            _jsxs('span', {
              className: cn('text-[10px] font-mono', theme.textMuted),
              children: [session.messageCount, ' ', t('home.msg', 'msg')],
            }),
        ],
      }),
    ],
  });
});
SessionRow.displayName = 'SessionRow';
// ============================================================================
// WELCOME SCREEN
// ============================================================================
export const HomePage = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const sessions = useViewStore((s) => s.sessions);
  const setCurrentView = useViewStore((s) => s.setCurrentView);
  const selectSession = useViewStore((s) => s.selectSession);
  const openTab = useViewStore((s) => s.openTab);
  const { createSessionWithSync } = useSessionSync();
  const recentSessions = useMemo(
    () => [...sessions].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_RECENT_SESSIONS),
    [sessions],
  );
  const handleOpenSession = useCallback(
    (sessionId) => {
      selectSession(sessionId);
      openTab(sessionId);
      setCurrentView('chat');
    },
    [selectSession, openTab, setCurrentView],
  );
  return _jsx('div', {
    'data-testid': 'home-view',
    className: 'h-full flex flex-col items-center p-8 overflow-y-auto',
    children: _jsxs('div', {
      className: 'my-auto flex flex-col items-center w-full',
      children: [
        _jsxs(motion.div, {
          'data-testid': 'welcome-hero',
          className: cn('flex flex-col items-center gap-6 p-8 rounded-3xl max-w-lg w-full', theme.card),
          variants: heroVariants,
          initial: 'hidden',
          animate: 'visible',
          children: [
            _jsxs('div', {
              className: 'relative',
              children: [
                _jsx('div', {
                  className: 'absolute inset-0 rounded-2xl blur-xl opacity-40',
                  style: { background: 'var(--matrix-accent)' },
                }),
                _jsx('img', {
                  src: theme.isLight ? '/logolight.webp' : '/logodark.webp',
                  alt: t('home.logoAlt', 'ClaudeHydra Logo'),
                  width: 512,
                  height: 453,
                  fetchPriority: 'high',
                  decoding: 'async',
                  className: 'relative w-56 h-56 object-contain drop-shadow-lg',
                }),
              ],
            }),
            _jsxs('div', {
              className: 'text-center',
              children: [
                _jsx('h1', {
                  className: cn('text-3xl font-bold font-mono tracking-tight', theme.title),
                  children: t('home.appName', 'ClaudeHydra'),
                }),
                _jsx('p', {
                  className: cn('text-sm mt-1.5 max-w-xs', theme.textMuted),
                  children: t(
                    'home.subtitle',
                    'AI Swarm Control Center — start a new chat or continue a previous conversation.',
                  ),
                }),
              ],
            }),
            _jsx(motion.div, {
              className: 'flex flex-wrap justify-center gap-2',
              variants: badgeContainerVariants,
              initial: 'hidden',
              animate: 'visible',
              children: FEATURE_BADGES.map(({ key, fallback, icon: Icon }) =>
                _jsx(
                  motion.div,
                  {
                    variants: badgeItemVariants,
                    children: _jsx(Badge, {
                      variant: 'accent',
                      size: 'sm',
                      icon: _jsx(Icon, { size: 12 }),
                      children: t(key, fallback),
                    }),
                  },
                  key,
                ),
              ),
            }),
            _jsx(motion.div, {
              className: 'w-full mt-2',
              variants: ctaVariants,
              initial: 'hidden',
              animate: 'visible',
              children: _jsx(Button, {
                variant: 'primary',
                size: 'md',
                leftIcon: _jsx(Plus, { size: 16 }),
                onClick: () => createSessionWithSync(),
                className: 'w-full',
                'data-testid': 'btn-new-chat',
                children: t('home.startChat', 'Start Chat'),
              }),
            }),
          ],
        }),
        _jsx(OAuthBanner, {}),
        _jsx(PasskeyLoginSection, {}),
        _jsx(AnimatePresence, {
          children:
            recentSessions.length > 0 &&
            _jsxs(motion.div, {
              className: 'w-full max-w-lg mt-8',
              variants: recentVariants,
              initial: 'hidden',
              animate: 'visible',
              exit: 'hidden',
              children: [
                _jsxs('div', {
                  className: 'flex items-center gap-2 mb-3',
                  children: [
                    _jsx(Clock, { size: 14, className: theme.iconMuted }),
                    _jsx('span', {
                      className: cn('text-xs uppercase tracking-wider font-mono', theme.textMuted),
                      children: t('home.recentChats', 'Recent Chats'),
                    }),
                  ],
                }),
                _jsx('div', {
                  className: 'space-y-2',
                  children: recentSessions.map((session) =>
                    _jsx(SessionRow, { session: session, onOpen: handleOpenSession, theme: theme }, session.id),
                  ),
                }),
              ],
            }),
        }),
        _jsx(AnimatePresence, {
          children:
            recentSessions.length === 0 &&
            _jsxs(motion.div, {
              className: 'flex flex-col items-center gap-3 mt-8 text-center',
              initial: { opacity: 0 },
              animate: { opacity: 1 },
              exit: { opacity: 0 },
              transition: { delay: 0.35 },
              children: [
                _jsx(Sparkles, { size: 32, className: cn(theme.iconMuted, 'opacity-40') }),
                _jsx('p', {
                  className: cn('text-sm', theme.textMuted),
                  children: t('home.noChats', 'No chats yet. Start a new conversation!'),
                }),
              ],
            }),
        }),
        _jsx(motion.div, {
          className: 'w-full max-w-lg mt-8',
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { delay: 0.45, duration: 0.4 },
          children: _jsx(HealthDashboard, {}),
        }),
      ],
    }),
  });
});
HomePage.displayName = 'HomePage';
export default HomePage;
