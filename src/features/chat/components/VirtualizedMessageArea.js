/**
 * VirtualizedMessageArea — Scrollable chat message area with virtual rendering.
 *
 * Uses @tanstack/react-virtual for efficient rendering of long conversations.
 * Includes search overlay, new-messages indicator, compaction divider, and
 * empty/welcome states.
 *
 * Extracted from ClaudeChatView.tsx to reduce component size.
 */
import { cn, EmptyState } from '@jaskier/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { PromptSuggestions } from '@/components/molecules/PromptSuggestions';
import ArrowDown from '~icons/lucide/arrow-down';
import Code2 from '~icons/lucide/code-2';
import FileSearch from '~icons/lucide/file-search';
import FileText from '~icons/lucide/file-text';
import GitBranch from '~icons/lucide/git-branch';
import Globe from '~icons/lucide/globe';
import MessageSquare from '~icons/lucide/message-square';
import Search from '~icons/lucide/search';
import { COMPACTION_DIVIDER_ID } from '../hooks/useChatMessages';
import { MessageBubble } from './MessageBubble';
import { SearchOverlay } from './SearchOverlay';

// ---------------------------------------------------------------------------
// Prompt suggestions for empty state
// ---------------------------------------------------------------------------
const CH_SUGGESTIONS = [
  {
    labelKey: 'chat.suggestions.analyzeCode',
    fallback: 'Analyze the code structure of my project',
    icon: Code2,
  },
  {
    labelKey: 'chat.suggestions.readFile',
    fallback: 'Read and explain a file from my codebase',
    icon: FileSearch,
  },
  {
    labelKey: 'chat.suggestions.gitStatus',
    fallback: 'Show git status and recent commits',
    icon: GitBranch,
  },
  {
    labelKey: 'chat.suggestions.scrapeWebpage',
    fallback: 'Fetch and summarize a webpage',
    icon: Globe,
  },
  {
    labelKey: 'chat.suggestions.ocrDocument',
    fallback: 'Extract text from an image or PDF (OCR)',
    icon: FileText,
  },
  {
    labelKey: 'chat.suggestions.searchFiles',
    fallback: 'Search for a pattern across project files',
    icon: Search,
  },
];
// ---------------------------------------------------------------------------
// Empty chat state sub-component (uses shared EmptyState molecule)
// ---------------------------------------------------------------------------
function EmptyChatState({ onSuggestionSelect }) {
  const { t } = useTranslation();
  return _jsxs(motion.div, {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.15 },
    'data-testid': 'chat-empty-state',
    className: 'h-full flex flex-col items-center justify-center',
    children: [
      _jsx(EmptyState, {
        icon: _jsx(MessageSquare, {}),
        title: t('chat.startConversation', 'Start a new conversation'),
        description: t(
          'chat.selectModelAndType',
          'Select a model and type a message. Drag and drop files to add context.',
        ),
      }),
      _jsx(PromptSuggestions, {
        suggestions: CH_SUGGESTIONS,
        onSelect: onSuggestionSelect,
      }),
    ],
  });
}
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const VirtualizedMessageArea = memo(function VirtualizedMessageArea({
  messages,
  welcomeMessage,
  setChatRef,
  bottomRef,
  messagesEndRef,
  searchOpen,
  searchMatchId,
  onSearchMatchChange,
  onSearchClose,
  showNewMessages,
  scrollToBottom,
  onSuggestionSelect,
  onRetry,
  onLoadFullHistory,
}) {
  const { t } = useTranslation();
  const parentRef = useRef(null);
  const prevCountRef = useRef(messages.length);
  // Merge parent ref with external setChatRef
  const setParentRef = useCallback(
    (el) => {
      parentRef.current = el;
      setChatRef(el);
    },
    [setChatRef],
  );
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
    getItemKey: (index) => messages[index]?.id ?? index,
  });
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevCountRef.current && messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, {
        align: 'end',
        behavior: 'smooth',
      });
    }
    prevCountRef.current = messages.length;
  }, [messages.length, virtualizer]);
  // Also scroll when the last message is streaming (content changing)
  const lastMessage = messages[messages.length - 1];
  const isLastStreaming = lastMessage?.streaming;
  useEffect(() => {
    if (isLastStreaming && messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }
  }, [isLastStreaming, messages.length, virtualizer]);
  // Shared container props
  const containerClasses = cn(
    'flex-1 p-4 overflow-y-auto relative transition-all rounded-lg',
    'scrollbar-thin',
  );
  const containerProps = {
    'data-testid': 'chat-message-area',
    role: 'log',
    'aria-live': 'polite',
    'aria-label': t('chat.messageArea', 'Chat messages'),
    className: containerClasses,
  };
  // Empty state / welcome message
  if (messages.length === 0) {
    return _jsxs('div', {
      ref: setParentRef,
      ...containerProps,
      children: [
        _jsx(AnimatePresence, {
          children:
            searchOpen &&
            _jsx(SearchOverlay, {
              messages: messages.filter((m) => !!m.id),
              onMatchChange: onSearchMatchChange,
              onClose: onSearchClose,
            }),
        }),
        welcomeMessage
          ? _jsx('div', {
              className: 'space-y-4',
              children: _jsx(MessageBubble, {
                message: {
                  id: 'welcome',
                  role: 'assistant',
                  content: welcomeMessage,
                  timestamp: Date.now(),
                },
                isLast: true,
                isStreaming: false,
              }),
            })
          : _jsx(EmptyChatState, { onSuggestionSelect: onSuggestionSelect }),
      ],
    });
  }
  return _jsxs('div', {
    ref: setParentRef,
    ...containerProps,
    children: [
      _jsx(AnimatePresence, {
        children:
          searchOpen &&
          _jsx(SearchOverlay, {
            messages: messages.filter((m) => !!m.id),
            onMatchChange: onSearchMatchChange,
            onClose: onSearchClose,
          }),
      }),
      _jsx('div', {
        style: {
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        },
        children: virtualizer.getVirtualItems().map((virtualRow) => {
          const msg = messages[virtualRow.index];
          if (!msg) return null;
          // Compaction divider — visual separator with "load full history" button
          if (msg.id === COMPACTION_DIVIDER_ID) {
            return _jsx(
              'div',
              {
                'data-index': virtualRow.index,
                ref: virtualizer.measureElement,
                style: {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                },
                children: _jsxs('div', {
                  className: 'flex items-center gap-3 py-3 px-2',
                  children: [
                    _jsx('div', {
                      className: 'flex-1 h-px bg-[var(--matrix-accent)]/30',
                    }),
                    _jsxs('div', {
                      className: 'flex items-center gap-2',
                      children: [
                        _jsx('span', {
                          className:
                            'text-xs font-mono text-[var(--matrix-accent)]/70',
                          children: t(
                            'chat.compaction.divider',
                            'Starsze wiadomości skompresowane',
                          ),
                        }),
                        onLoadFullHistory &&
                          _jsx('button', {
                            type: 'button',
                            onClick: onLoadFullHistory,
                            className:
                              'text-xs font-mono text-[var(--matrix-accent)] hover:text-[var(--matrix-accent)]/80 underline underline-offset-2 transition-colors',
                            children: t(
                              'chat.compaction.loadFull',
                              'Załaduj pełną historię',
                            ),
                          }),
                      ],
                    }),
                    _jsx('div', {
                      className: 'flex-1 h-px bg-[var(--matrix-accent)]/30',
                    }),
                  ],
                }),
              },
              virtualRow.key,
            );
          }
          return _jsx(
            'div',
            {
              'data-index': virtualRow.index,
              'data-message-id': msg.id,
              ref: virtualizer.measureElement,
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              },
              children: _jsx('div', {
                className: `pb-4 ${searchMatchId === msg.id ? 'ring-2 ring-yellow-400/60 rounded-xl' : ''}`,
                children: _jsx(MessageBubble, {
                  message: msg,
                  isLast: virtualRow.index === messages.length - 1,
                  isStreaming: !!msg.streaming,
                  onRetry: onRetry,
                }),
              }),
            },
            virtualRow.key,
          );
        }),
      }),
      _jsx('div', { ref: bottomRef }),
      _jsx('div', { ref: messagesEndRef }),
      _jsx(AnimatePresence, {
        children:
          showNewMessages &&
          _jsxs(motion.button, {
            type: 'button',
            initial: { opacity: 0, y: 10 },
            animate: { opacity: 1, y: 0 },
            exit: { opacity: 0, y: 10 },
            onClick: scrollToBottom,
            className:
              'sticky bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--matrix-accent)] text-[var(--matrix-bg-primary)] text-sm font-mono shadow-lg hover:shadow-xl transition-shadow',
            'aria-label': t(
              'chat.newMessages',
              'New messages, scroll to bottom',
            ),
            children: [
              _jsx(ArrowDown, { width: 14, height: 14 }),
              t('chat.newMessages', 'New messages'),
            ],
          }),
      }),
    ],
  });
});
VirtualizedMessageArea.displayName = 'VirtualizedMessageArea';
