/**
 * Sidebar — ClaudeHydra collapsible navigation sidebar (Tissaia style).
 * Ported from ClaudeHydra v3 `web/src/components/Sidebar.tsx`.
 *
 * Layout: EPS AI Solutions logo + nav items + session manager + theme toggle + version.
 * States: expanded (w-60) / collapsed (w-16) with smooth animation.
 * Mobile: overlay drawer on small screens.
 *
 * Neutral white accent (#ffffff) for active states, hovers, borders, glows.
 */

import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit2,
  ExternalLink,
  Loader2,
  type LucideIcon,
  Menu,
  MessageSquare,
  MessagesSquare,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  type KeyboardEvent,
  lazy,
  type PointerEvent as ReactPointerEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/contexts/ThemeContext';
import { usePartnerSessions } from '@/features/chat/hooks/usePartnerSessions';
import { useSessionSync } from '@/features/chat/hooks/useSessionSync';

const PartnerChatModal = lazy(() => import('@/features/chat/components/PartnerChatModal'));

import { SessionSearch } from '@/components/molecules/SessionSearch';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';
import { type ChatSession, useViewStore, type ViewId } from '@/stores/viewStore';
import { FooterControls } from './sidebar/FooterControls';
import { LogoButton } from './sidebar/LogoButton';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: { id: ViewId; label: string; icon: LucideIcon }[];
}

const MOBILE_BREAKPOINT = 768;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// useIsMobile hook (inline — matches legacy useIsMobile)
// ---------------------------------------------------------------------------

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

// ---------------------------------------------------------------------------
// SessionItem sub-component
// ---------------------------------------------------------------------------

interface SessionItemProps {
  session: ChatSession;
  isActive: boolean;
  isFocused?: boolean;
  collapsed: boolean;
  isDark: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}

function SessionItem({
  session,
  isActive,
  isFocused = false,
  collapsed,
  isDark,
  onSelect,
  onDelete,
  onRename,
}: SessionItemProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  const handleSave = () => {
    if (editTitle.trim() && editTitle !== session.title) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(session.title);
    setIsEditing(false);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete();
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  };

  // Collapsed: just an icon button
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onSelect}
        data-testid="sidebar-session-item"
        className={cn(
          'w-full p-2 rounded flex items-center justify-center transition-colors',
          isActive
            ? isDark
              ? 'bg-white/15 text-[var(--matrix-accent)]'
              : 'bg-emerald-500/15 text-[var(--matrix-accent)]'
            : isDark
              ? 'hover:bg-white/[0.08] text-[var(--matrix-text-secondary)]'
              : 'hover:bg-black/5 text-[var(--matrix-text-secondary)]',
        )}
        title={session.title}
      >
        <MessageSquare size={16} />
      </button>
    );
  }

  // Editing mode
  if (isEditing) {
    return (
      <div className="flex items-center gap-1 p-1">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={handleEditKeyDown}
          className="flex-1 glass-input text-xs py-1 px-2"
          ref={(el) => el?.focus()}
        />
        <button
          type="button"
          onClick={handleSave}
          className={cn('p-1 rounded text-[var(--matrix-accent)]', isDark ? 'hover:bg-white/15' : 'hover:bg-black/5')}
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className={cn(
            'p-1 rounded',
            isDark ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-500/15 text-red-600',
          )}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // Default: session row
  return (
    <div
      role="option"
      aria-selected={isActive}
      tabIndex={0}
      data-testid="sidebar-session-item"
      className={cn(
        'group relative flex items-center gap-2 p-2 rounded cursor-pointer transition-colors w-full text-left',
        isActive
          ? isDark
            ? 'bg-white/15 text-[var(--matrix-accent)]'
            : 'bg-emerald-500/15 text-[var(--matrix-accent)]'
          : isDark
            ? 'hover:bg-white/[0.08] text-[var(--matrix-text-secondary)]'
            : 'hover:bg-black/5 text-[var(--matrix-text-secondary)]',
        isFocused && 'ring-2 ring-[var(--matrix-accent)]/50',
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-label={`Select session: ${session.title}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* #16 - Show spinner for pending sessions */}
      {session._pending ? (
        <Loader2 size={14} className="flex-shrink-0 animate-spin text-[var(--matrix-accent)]/60" />
      ) : (
        <MessageSquare size={14} className="flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm truncate', session._pending && 'opacity-60 italic')}>{session.title}</p>
        <p className="text-xs text-[var(--matrix-text-secondary)] truncate">
          {session._pending
            ? t('sidebar.creating', 'Creating...')
            : `${session.messageCount} ${session.messageCount === 1 ? t('sidebar.message', 'message') : t('sidebar.messages', 'messages')}`}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          className={cn('p-1 rounded', isDark ? 'hover:bg-white/15' : 'hover:bg-black/5')}
          title={t('sidebar.rename', 'Rename')}
        >
          <Edit2 size={12} />
        </button>
        <button
          type="button"
          onClick={handleDeleteClick}
          className={cn(
            'p-1 rounded transition-colors',
            confirmDelete
              ? isDark
                ? 'bg-red-500/30 text-red-300'
                : 'bg-red-500/20 text-red-600'
              : isDark
                ? 'hover:bg-red-500/20 text-red-400'
                : 'hover:bg-red-500/15 text-red-600',
          )}
          title={confirmDelete ? t('sidebar.confirmDelete', 'Click again to delete') : t('common.delete', 'Delete')}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Tooltip with preview */}
      {showTooltip && session.preview && (
        <div
          className={cn(
            'absolute left-full top-0 ml-2 z-50 w-56 p-2.5 rounded-lg',
            isDark
              ? 'bg-[var(--matrix-bg-primary)]/95 border border-white/20'
              : 'bg-[var(--matrix-bg-primary)]/95 border border-black/10',
            'shadow-lg shadow-black/40 backdrop-blur-sm pointer-events-none',
            'animate-fade-in',
          )}
        >
          <p className="text-[11px] text-[var(--matrix-text-primary)] font-medium truncate mb-1">{session.title}</p>
          <p className="text-[10px] text-[var(--matrix-text-secondary)] line-clamp-3 leading-relaxed">
            {session.preview}
          </p>
          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[var(--matrix-border)]">
            <span className="text-[9px] text-[var(--matrix-text-secondary)]">
              {session.messageCount}{' '}
              {session.messageCount === 1 ? t('sidebar.message', 'message') : t('sidebar.messages', 'messages')}
            </span>
            <span className="text-[9px] text-[var(--matrix-accent)]">
              {timeAgo(session.updatedAt ?? session.createdAt)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar Content (shared between desktop & mobile)
// ---------------------------------------------------------------------------

interface SidebarContentProps {
  collapsed: boolean;
  onClose?: () => void;
  isMobile?: boolean;
}

function SidebarContent({ collapsed, onClose, isMobile = false }: SidebarContentProps) {
  const { t } = useTranslation();
  const { currentView, setView } = useViewStore();
  const {
    activeSessionId,
    chatSessions,
    selectSession,
    openTab,
    createSessionWithSync,
    deleteSessionWithSync,
    renameSessionWithSync,
  } = useSessionSync();

  const theme = useViewTheme();
  const isLight = theme.isLight;
  const isDark = !isLight;

  // Partner sessions (GeminiHydra)
  const { data: partnerSessions, isLoading: partnerLoading, isError: partnerError } = usePartnerSessions();
  const [showPartnerSessions, setShowPartnerSessions] = useState(true);
  const [partnerModalSessionId, setPartnerModalSessionId] = useState<string | null>(null);
  const sortedPartnerSessions = useMemo(
    () =>
      [...(partnerSessions ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [partnerSessions],
  );

  const [showSessions, setShowSessions] = useState(true);

  // #19 - Session search/filter
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');
  const handleSessionSearch = useCallback((query: string) => {
    setSessionSearchQuery(query);
  }, []);

  // Navigation groups (Tissaia style — uses i18n)
  const navGroups: NavGroup[] = [
    {
      id: 'main',
      label: t('sidebar.groups.main', 'MAIN'),
      icon: Sparkles,
      items: [
        { id: 'home', label: t('nav.home', 'Home'), icon: Zap },
        { id: 'chat', label: t('nav.chat', 'Chat'), icon: MessageSquare },
        { id: 'settings', label: t('nav.settings', 'Settings'), icon: Settings },
      ],
    },
  ];

  // Grouped navigation - expandable sections (Tissaia style)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('claudehydra_expanded_groups');
      const defaults = { main: true };
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return { main: true };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('claudehydra_expanded_groups', JSON.stringify(expandedGroups));
    } catch {
      /* ignore */
    }
  }, [expandedGroups]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Sort sessions by updatedAt descending, then filter by search query (#19)
  const sortedSessions = useMemo(() => {
    const sorted = [...chatSessions].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
    if (!sessionSearchQuery) return sorted;
    return sorted.filter((s) => s.title.toLowerCase().includes(sessionSearchQuery));
  }, [chatSessions, sessionSearchQuery]);

  const navigateTo = useCallback(
    (view: ViewId) => {
      setView(view);
      if (isMobile && onClose) onClose();
    },
    [setView, isMobile, onClose],
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      selectSession(sessionId);
      openTab(sessionId);
      setView('chat');
      if (isMobile && onClose) onClose();
    },
    [selectSession, openTab, setView, isMobile, onClose],
  );

  // #42 — Keyboard navigation for session list
  const [focusedSessionIndex, setFocusedSessionIndex] = useState(-1);

  const handleSessionListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedSessionIndex((i) => (i + 1) % sortedSessions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedSessionIndex((i) => (i - 1 + sortedSessions.length) % sortedSessions.length);
      } else if (e.key === 'Enter' && focusedSessionIndex >= 0 && sortedSessions[focusedSessionIndex]) {
        e.preventDefault();
        handleSelectSession(sortedSessions[focusedSessionIndex].id);
      }
    },
    [sortedSessions, focusedSessionIndex, handleSelectSession],
  );

  return (
    <>
      {/* ---- Logo ---- */}
      <LogoButton collapsed={collapsed} onClick={() => navigateTo('home')} />

      {/* ---- Grouped Navigation (Tissaia style) ---- */}
      <nav className="flex flex-col gap-2 flex-shrink-0 px-2">
        {navGroups.map((group) => {
          const isExpanded = expandedGroups[group.id];
          const hasActiveItem = group.items.some((item) => item.id === currentView);
          const GroupIcon = group.icon;

          return (
            <div key={group.id} className={cn(isLight ? 'glass-panel-light' : 'glass-panel-dark', 'overflow-hidden')}>
              {/* Group Header */}
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${group.label} group`}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 transition-all group',
                    hasActiveItem
                      ? isLight
                        ? 'text-emerald-600 bg-emerald-500/5'
                        : 'text-white bg-white/5'
                      : cn(
                          theme.textMuted,
                          isLight ? 'hover:text-black hover:bg-black/5' : 'hover:text-white hover:bg-white/5',
                        ),
                  )}
                >
                  <div className="flex items-center gap-2">
                    <GroupIcon size={14} />
                    <span className="text-sm font-bold tracking-[0.12em] uppercase">{group.label}</span>
                  </div>
                  <ChevronDown
                    size={14}
                    className={cn('transition-transform duration-200', isExpanded ? '' : '-rotate-90')}
                  />
                </button>
              )}

              {/* Group Items */}
              <div
                className={cn(
                  'px-1.5 pb-1.5 space-y-0.5 overflow-hidden transition-all duration-200',
                  !collapsed && !isExpanded ? 'max-h-0 opacity-0 pb-0' : 'max-h-96 opacity-100',
                  collapsed ? 'py-1.5' : '',
                )}
              >
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`nav-${item.id}`}
                      onClick={() => navigateTo(item.id)}
                      className={cn(
                        'relative w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group',
                        collapsed ? 'justify-center' : '',
                        isActive
                          ? isLight
                            ? 'bg-emerald-500/15 text-emerald-600'
                            : 'bg-white/10 text-white'
                          : cn(
                              theme.textMuted,
                              isLight ? 'hover:bg-black/5 hover:text-black' : 'hover:bg-white/5 hover:text-white',
                            ),
                      )}
                      title={collapsed ? item.label : undefined}
                      aria-label={`Navigate to ${item.label}`}
                    >
                      <Icon
                        size={16}
                        className={cn(
                          'transition-colors flex-shrink-0',
                          isActive
                            ? isLight
                              ? 'text-emerald-600'
                              : 'text-white'
                            : cn(theme.iconMuted, isLight ? 'group-hover:text-black' : 'group-hover:text-white'),
                        )}
                      />
                      {!collapsed && <span className="font-medium text-base tracking-wide truncate">{item.label}</span>}
                      {isActive && (
                        <div
                          className={cn(
                            'absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full',
                            isLight
                              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                              : 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]',
                          )}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ---- Session Manager (Tissaia style) ---- */}
      <div
        className={cn(
          isLight ? 'glass-panel-light' : 'glass-panel-dark',
          'flex-1 flex flex-col min-h-0 p-2 mx-2 overflow-hidden',
        )}
      >
        <div className="flex items-center justify-between px-1 py-1.5">
          <button
            type="button"
            data-testid="sidebar-chats-toggle"
            onClick={() => setShowSessions(!showSessions)}
            aria-expanded={showSessions}
            aria-label={`${showSessions ? 'Collapse' : 'Expand'} chat sessions`}
            className={cn(
              'flex items-center gap-2 transition-colors',
              isLight ? `${theme.textMuted} hover:text-black` : `${theme.textMuted} hover:text-white`,
            )}
          >
            <MessagesSquare size={14} />
            {!collapsed && (
              <span className="text-sm font-bold tracking-[0.12em] uppercase">{t('sidebar.chats', 'CHATS')}</span>
            )}
            {!collapsed && (
              <ChevronDown
                size={14}
                className={cn('transition-transform duration-200', showSessions ? '' : '-rotate-90')}
              />
            )}
          </button>
          <button
            type="button"
            data-testid="sidebar-new-chat-btn"
            onClick={() => createSessionWithSync()}
            className={cn(
              'p-1.5 rounded text-[var(--matrix-accent)] transition-colors',
              isDark ? 'hover:bg-white/15' : 'hover:bg-black/5',
            )}
            title={t('sidebar.newChat', 'New chat')}
            aria-label={t('sidebar.newChat', 'New chat')}
          >
            <Plus size={14} />
          </button>
        </div>

        {/* #19 - Session search input (only when expanded and sessions visible) */}
        {!collapsed && showSessions && chatSessions.length > 0 && (
          <SessionSearch onSearch={handleSessionSearch} className="px-1 pb-1.5" />
        )}

        <AnimatePresence>
          {showSessions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              role="listbox"
              aria-label={t('sidebar.chats', 'Chat sessions')}
              onKeyDown={handleSessionListKeyDown}
              data-testid="sidebar-session-list"
              className="flex-1 space-y-1 overflow-y-auto min-h-0"
            >
              {sortedSessions.length === 0 ? (
                <p className="text-[10px] text-[var(--matrix-text-secondary)] text-center py-2">
                  {collapsed
                    ? ''
                    : sessionSearchQuery
                      ? t('sidebar.noSearchResults', 'No matching chats')
                      : t('sidebar.noChats', 'No chats yet')}
                </p>
              ) : (
                sortedSessions.map((session, idx) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    isFocused={focusedSessionIndex === idx}
                    collapsed={collapsed}
                    isDark={isDark}
                    onSelect={() => handleSelectSession(session.id)}
                    onDelete={() => deleteSessionWithSync(session.id)}
                    onRename={(newTitle) => renameSessionWithSync(session.id, newTitle)}
                  />
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ---- Partner Sessions — GeminiHydra ---- */}
      <div
        className={cn(
          isLight ? 'glass-panel-light' : 'glass-panel-dark',
          'flex flex-col min-h-0 p-2 mx-2 overflow-hidden',
        )}
      >
        <div className="flex items-center justify-between px-1 py-1.5">
          <button
            type="button"
            onClick={() => setShowPartnerSessions(!showPartnerSessions)}
            aria-expanded={showPartnerSessions}
            aria-label={`${showPartnerSessions ? 'Collapse' : 'Expand'} GeminiHydra partner sessions`}
            className={cn(
              'flex items-center gap-2 transition-colors',
              isLight ? `${theme.textMuted} hover:text-black` : `${theme.textMuted} hover:text-white`,
            )}
          >
            <div
              className={cn(
                'w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0',
                isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400',
              )}
            >
              GH
            </div>
            {!collapsed && (
              <span className="text-sm font-bold tracking-[0.12em] uppercase">
                {t('sidebar.partnerApp', 'GeminiHydra')}
              </span>
            )}
            {!collapsed && (
              <ChevronDown
                size={14}
                className={cn('transition-transform duration-200', showPartnerSessions ? '' : '-rotate-90')}
              />
            )}
          </button>
          <div className="flex items-center gap-1">
            {partnerLoading && <Loader2 size={12} className="animate-spin text-blue-400" />}
            {partnerError && <WifiOff size={12} className={cn(theme.iconMuted)} />}
            {!partnerLoading && !partnerError && (
              <span className={cn('text-xs', theme.textMuted)}>{sortedPartnerSessions.length}</span>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showPartnerSessions && !collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="flex-1 space-y-1 overflow-y-auto min-h-0"
            >
              {partnerError && (
                <p className="text-[10px] text-[var(--matrix-text-secondary)] text-center py-2">Offline</p>
              )}
              {!partnerError && sortedPartnerSessions.length === 0 && !partnerLoading && (
                <p className="text-[10px] text-[var(--matrix-text-secondary)] text-center py-2">
                  {t('sidebar.noSessions', 'No sessions')}
                </p>
              )}
              {sortedPartnerSessions.map((ps) => (
                <button
                  type="button"
                  key={ps.id}
                  onClick={() => setPartnerModalSessionId(ps.id)}
                  className={cn(
                    'group relative flex items-center gap-2 p-2 rounded cursor-pointer transition-colors w-full text-left',
                    isDark
                      ? 'hover:bg-white/[0.08] text-[var(--matrix-text-secondary)]'
                      : 'hover:bg-black/5 text-[var(--matrix-text-secondary)]',
                  )}
                  title={ps.title}
                >
                  <MessageSquare
                    size={14}
                    className={cn('flex-shrink-0', isLight ? 'text-blue-500' : 'text-blue-400/60')}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{ps.title}</p>
                    <p className="text-xs text-[var(--matrix-text-secondary)] truncate">
                      {ps.message_count} {ps.message_count === 1 ? 'message' : 'messages'}
                    </p>
                  </div>
                  <ExternalLink
                    size={10}
                    className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0 text-[var(--matrix-text-secondary)]"
                  />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Partner session modal (lazy-loaded) */}
      <Suspense fallback={null}>
        <PartnerChatModal sessionId={partnerModalSessionId} onClose={() => setPartnerModalSessionId(null)} />
      </Suspense>

      {/* ---- Bottom: Theme & Language + Version ---- */}
      <FooterControls collapsed={collapsed} version="ClaudeHydra v4.0.0" tagline={t('footer.tagline', 'AI Swarm')} />

      {/* ---- Mobile close button ---- */}
      {isMobile && (
        <div className="p-2 border-t border-[var(--matrix-border)]">
          <button
            type="button"
            data-testid="mobile-close-btn"
            onClick={onClose}
            className="nav-item w-full justify-center text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-accent)]"
          >
            <X size={18} />
            <span className="text-sm">{t('common.close', 'Close')}</span>
          </button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Sidebar component
// ---------------------------------------------------------------------------

export function Sidebar() {
  const { t } = useTranslation();
  const { sidebarCollapsed, setSidebarCollapsed, toggleSidebar, mobileDrawerOpen, setMobileDrawerOpen, currentView } =
    useViewStore();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const isMobile = useIsMobile();

  // #29 — Auto-collapse sidebar on mobile (<768px)
  useEffect(() => {
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  }, [isMobile, setSidebarCollapsed]);

  // Auto-close mobile drawer on view change (currentView is intentional trigger)
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentView triggers close on navigation
  useEffect(() => {
    if (isMobile) setMobileDrawerOpen(false);
  }, [currentView, isMobile, setMobileDrawerOpen]);

  // #29 — Swipe gesture for mobile drawer
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handlePointerDown = useCallback((e: ReactPointerEvent) => {
    swipeStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  }, []);

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!swipeStartRef.current) return;
      const dx = e.clientX - swipeStartRef.current.x;
      const dy = Math.abs(e.clientY - swipeStartRef.current.y);
      const dt = Date.now() - swipeStartRef.current.time;
      swipeStartRef.current = null;

      // Swipe must be mostly horizontal, fast enough, and long enough
      if (dt < 500 && dy < 80) {
        if (dx < -60 && mobileDrawerOpen) {
          // Swipe left: close drawer
          setMobileDrawerOpen(false);
        } else if (dx > 60 && !mobileDrawerOpen && e.clientX - dx < 40) {
          // Swipe right from left edge: open drawer
          setMobileDrawerOpen(true);
        }
      }
    },
    [mobileDrawerOpen, setMobileDrawerOpen],
  );

  // Global swipe-from-left-edge to open
  useEffect(() => {
    if (!isMobile) return;
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch && touch.clientX < 30) {
        swipeStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      }
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (!swipeStartRef.current) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - swipeStartRef.current.x;
      const dy = Math.abs(touch.clientY - swipeStartRef.current.y);
      const dt = Date.now() - swipeStartRef.current.time;
      swipeStartRef.current = null;
      if (dt < 500 && dy < 80 && dx > 60 && !mobileDrawerOpen) {
        setMobileDrawerOpen(true);
      }
    };
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile, mobileDrawerOpen, setMobileDrawerOpen]);

  // Mobile: hamburger + overlay drawer with swipe + backdrop
  if (isMobile) {
    return (
      <>
        {/* Hamburger trigger */}
        <button
          type="button"
          data-testid="mobile-hamburger"
          onClick={() => setMobileDrawerOpen(true)}
          className={cn(
            'fixed top-3 left-3 z-50 p-2 rounded-lg',
            'glass-panel transition-colors',
            isDark ? 'hover:bg-white/[0.08]' : 'hover:bg-black/5',
          )}
          title={t('common.menu', 'Menu')}
          aria-label={t('sidebar.openSidebar', 'Open sidebar')}
        >
          <Menu size={20} className="text-[var(--matrix-accent)]" />
        </button>

        {/* Backdrop (#29 overlay) */}
        <AnimatePresence>
          {mobileDrawerOpen && (
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              data-testid="mobile-backdrop"
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setMobileDrawerOpen(false)}
              role="presentation"
            />
          )}
        </AnimatePresence>

        {/* Drawer with swipe gesture support */}
        <motion.aside
          initial={{ x: '-100%' }}
          animate={{ x: mobileDrawerOpen ? 0 : '-100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          data-testid="mobile-drawer"
          className={cn(
            'fixed top-0 left-0 h-full w-72 z-50 flex flex-col touch-pan-y',
            isDark ? 'glass-panel-dark' : 'glass-panel-light',
          )}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <SidebarContent collapsed={false} onClose={() => setMobileDrawerOpen(false)} isMobile />
        </motion.aside>
      </>
    );
  }

  // Desktop: inline sidebar
  return (
    <motion.aside
      data-testid="sidebar"
      initial={false}
      animate={{ width: sidebarCollapsed ? 64 : 240 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={cn(isDark ? 'glass-panel-dark' : 'glass-panel-light', 'flex flex-col h-full overflow-hidden relative')}
    >
      <SidebarContent collapsed={sidebarCollapsed} />

      {/* Collapse toggle (desktop only) */}
      <button
        type="button"
        data-testid="sidebar-collapse-toggle"
        onClick={toggleSidebar}
        className={cn(
          'absolute top-1/2 -translate-y-1/2 -right-4 z-20',
          'w-9 h-9 rounded-full flex items-center justify-center',
          'bg-[var(--matrix-bg-secondary)] border border-[var(--matrix-border)]',
          'text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-accent)]',
          isDark
            ? 'hover:border-[var(--matrix-accent)] hover:shadow-[0_0_12px_rgba(255,255,255,0.15)]'
            : 'hover:border-[var(--matrix-accent)] hover:shadow-[0_0_12px_rgba(5,150,105,0.3)]',
          'backdrop-blur-sm transition-all duration-200 hover:scale-110 active:scale-95',
          'shadow-lg',
        )}
        title={
          sidebarCollapsed
            ? t('sidebar.expandSidebar', 'Expand sidebar')
            : t('sidebar.collapseSidebar', 'Collapse sidebar')
        }
        aria-label={
          sidebarCollapsed
            ? t('sidebar.expandSidebar', 'Expand sidebar')
            : t('sidebar.collapseSidebar', 'Collapse sidebar')
        }
      >
        {sidebarCollapsed ? <ChevronRight size={18} strokeWidth={2.5} /> : <ChevronLeft size={18} strokeWidth={2.5} />}
      </button>
    </motion.aside>
  );
}
