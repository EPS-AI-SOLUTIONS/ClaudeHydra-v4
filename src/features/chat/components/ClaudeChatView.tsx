/**
 * ClaudeChatView — Full chat interface for Claude API with NDJSON streaming.
 *
 * Supports agentic tool_use loop: when tools are enabled, Claude can invoke
 * local file tools (read, list, write, search) and results are displayed
 * inline as collapsible ToolCallBlock panels.
 */

import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, Bot, Check, ClipboardList, MessageSquare, Trash2, Wrench } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/atoms/Button';
import { EmptyState } from '@/components/molecules/EmptyState';
import { type ModelOption, ModelSelector } from '@/components/molecules/ModelSelector';
import { useAutoScroll } from '@/features/chat/hooks/useAutoScroll';
import { type ClaudeModel, FALLBACK_CLAUDE_MODELS, useClaudeModels } from '@/features/chat/hooks/useClaudeModels';
import { useSessionSync } from '@/features/chat/hooks/useSessionSync';
import type { SessionDetail } from '@/features/chat/hooks/useSessions';
import { apiGet } from '@/shared/api/client';
import { env } from '@/shared/config/env';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
import { copyToClipboard } from '@/shared/utils/clipboard';
import { cn } from '@/shared/utils/cn';
import { formatDateTime, formatTime } from '@/shared/utils/locale';
import { useViewStore } from '@/stores/viewStore';
import { usePromptHistory } from '../hooks/usePromptHistory';
import { type Attachment, ChatInput } from './ChatInput';
import { type ChatMessage, MessageBubble } from './MessageBubble';
import { SearchOverlay } from './SearchOverlay';
import type { ToolInteraction } from './ToolCallBlock';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extended NDJSON chunk — may be a text token, tool_call, or tool_result. */
interface NdjsonEvent {
  // Text token (backward-compatible)
  token?: string;
  done?: boolean;
  model?: string;
  total_tokens?: number;
  // Extended tool events
  type?: 'tool_call' | 'tool_result';
  tool_use_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  result?: string;
  is_error?: boolean;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// System prompt (sent as hidden context, not shown in chat)
// ---------------------------------------------------------------------------

function buildSystemPrompt(workingDirectory?: string, language?: string): string {
  const langName = language === 'pl' ? 'Polish' : 'English';

  const lines = [
    'You are a Witcher-themed AI agent in the ClaudeHydra v4 Swarm Control Center.',
    'The swarm consists of 12 agents organized in 3 tiers:',
    '- Commander (Geralt, Yennefer, Vesemir) → Claude Opus 4.6',
    '- Coordinator (Triss, Jaskier, Ciri, Dijkstra) → Claude Sonnet 4.5',
    '- Executor (Lambert, Eskel, Regis, Zoltan, Philippa) → Claude Haiku 4.5',
    '',
    'You assist the user with software engineering tasks.',
    'You have access to local file tools (read_file, list_directory, write_file, search_in_files).',
    'Use them proactively when the user asks about files or code.',
    'Respond concisely and helpfully. Use markdown formatting when appropriate.',
    `Write ALL text in **${langName}** (except code, file paths, and identifiers).`,
  ];

  if (workingDirectory) {
    lines.push(
      '',
      `## Working Directory`,
      `**Current working directory**: \`${workingDirectory}\``,
      'You can use relative paths (e.g. `src/main.rs`) — they resolve against this directory.',
      'You do NOT need to specify absolute paths unless referencing files outside this folder.',
    );
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Auth secret (for direct fetch calls that bypass the shared API client)
// ---------------------------------------------------------------------------

const AUTH_SECRET = env.VITE_AUTH_SECRET;

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function claudeHealthCheck(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return false;
    const data = await res.json();
    const anthropic = data.providers?.find((p: { name: string; available: boolean }) => p.name === 'anthropic');
    return anthropic?.available ?? false;
  } catch {
    return false;
  }
}

/**
 * Extended NDJSON streaming — yields text tokens, tool_call, and tool_result events.
 */
async function* claudeStreamChat(
  model: string,
  messages: Array<{ role: string; content: string }>,
  toolsEnabled: boolean,
  sessionId?: string,
  signal?: AbortSignal,
): AsyncGenerator<NdjsonEvent> {
  const res = await fetch('/api/claude/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(AUTH_SECRET ? { Authorization: `Bearer ${AUTH_SECRET}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 4096,
      stream: true,
      tools_enabled: toolsEnabled,
      ...(sessionId && { session_id: sessionId }),
    }),
    ...(signal !== undefined && { signal }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Chat request failed: ${res.status} ${errorText}`);
  }

  if (!res.body) {
    throw new Error('Response body is null — streaming not supported');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event: NdjsonEvent = JSON.parse(line);
        yield event;
      } catch {
        // Ignore NDJSON parse errors on partial lines
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Model option adapter
// ---------------------------------------------------------------------------

function toModelOption(m: ClaudeModel): ModelOption {
  return {
    id: m.id,
    name: m.name,
    provider: m.provider,
    available: m.available,
    description: m.tier,
  };
}

// ---------------------------------------------------------------------------
// Empty state sub-component (uses shared EmptyState molecule)
// ---------------------------------------------------------------------------

function EmptyChatState() {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      data-testid="chat-empty-state"
      className="h-full flex items-center justify-center"
    >
      <EmptyState
        icon={MessageSquare}
        title={t('chat.startConversation', 'Start a new conversation')}
        description={t(
          'chat.selectModelAndType',
          'Select a model and type a message. Drag and drop files to add context.',
        )}
      />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// #1 — Virtualized message area sub-component
// Uses @tanstack/react-virtual for efficient rendering of long conversations.
// ---------------------------------------------------------------------------

interface VirtualizedMessageAreaProps {
  messages: ChatMessage[];
  welcomeMessage?: string;
  setChatRef: (el: HTMLDivElement | null) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  searchOpen: boolean;
  searchMatchId: string | null;
  onSearchMatchChange: (messageId: string | null) => void;
  onSearchClose: () => void;
  showNewMessages: boolean;
  scrollToBottom: () => void;
}

function VirtualizedMessageArea({
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
}: VirtualizedMessageAreaProps) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(messages.length);

  // Merge parent ref with external setChatRef
  const setParentRef = useCallback(
    (el: HTMLDivElement | null) => {
      (parentRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
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
      // Scroll to the last item
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'smooth' });
    }
    prevCountRef.current = messages.length;
  }, [messages.length, virtualizer]);

  // Also scroll when the last message is streaming (content changing)
  const lastMessage = messages[messages.length - 1];
  const isLastStreaming = lastMessage?.streaming;
  // biome-ignore lint/correctness/useExhaustiveDependencies: lastMessage?.content.length is intentional — triggers scroll on each streaming token
  useEffect(() => {
    if (isLastStreaming && messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }
  }, [isLastStreaming, lastMessage?.content.length, messages.length, virtualizer]);

  // Empty state / welcome message
  if (messages.length === 0) {
    return (
      <div
        ref={setParentRef}
        data-testid="chat-message-area"
        role="log"
        aria-live="polite"
        aria-label={t('chat.messageArea', 'Chat messages')}
        className={cn('flex-1 p-4 overflow-y-auto relative transition-all rounded-lg', 'scrollbar-thin')}
      >
        <AnimatePresence>
          {searchOpen && (
            <SearchOverlay messages={messages} onMatchChange={onSearchMatchChange} onClose={onSearchClose} />
          )}
        </AnimatePresence>
        {welcomeMessage ? (
          <div className="space-y-4">
            <MessageBubble
              message={{
                id: 'welcome',
                role: 'assistant',
                content: welcomeMessage,
                timestamp: new Date(),
              }}
            />
          </div>
        ) : (
          <EmptyChatState />
        )}
      </div>
    );
  }

  return (
    <div
      ref={setParentRef}
      data-testid="chat-message-area"
      role="log"
      aria-live="polite"
      aria-label={t('chat.messageArea', 'Chat messages')}
      className={cn('flex-1 p-4 overflow-y-auto relative transition-all rounded-lg', 'scrollbar-thin')}
    >
      {/* #19 — Search overlay */}
      <AnimatePresence>
        {searchOpen && (
          <SearchOverlay messages={messages} onMatchChange={onSearchMatchChange} onClose={onSearchClose} />
        )}
      </AnimatePresence>

      {/* Virtualized message list */}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const msg = messages[virtualRow.index];
          if (!msg) return null;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              data-message-id={msg.id}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="pb-4">
                <MessageBubble
                  message={msg}
                  className={searchMatchId === msg.id ? 'ring-2 ring-yellow-400/60 rounded-xl' : undefined}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div ref={bottomRef} />
      <div ref={messagesEndRef} />

      {/* #20 — New messages floating button */}
      <AnimatePresence>
        {showNewMessages && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={scrollToBottom}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--matrix-accent)] text-[var(--matrix-bg-primary)] text-sm font-mono shadow-lg hover:shadow-xl transition-shadow"
            aria-label={t('chat.newMessages', 'New messages, scroll to bottom')}
          >
            <ArrowDown size={14} />
            {t('chat.newMessages', 'New messages')}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClaudeChatView component
// ---------------------------------------------------------------------------

export function ClaudeChatView() {
  const { t, i18n } = useTranslation();

  // Dynamic model registry (falls back to hardcoded list)
  const { data: claudeModels } = useClaudeModels();
  const models = claudeModels ?? FALLBACK_CLAUDE_MODELS;

  // Model state
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  const [claudeConnected, setClaudeConnected] = useState(false);

  // Per-session message cache & loading state
  const sessionMessagesRef = useRef<Record<string, ChatMessage[]>>({});
  const loadingSessionsRef = useRef<Set<string>>(new Set());
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  // Displayed state (derived from active session)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Tools toggle
  const [toolsEnabled, setToolsEnabled] = useState(true);

  // DB sync
  const { addMessageWithSync, renameSessionWithSync, generateTitleWithSync } = useSessionSync();
  const activeSessionId = useViewStore((s) => s.activeSessionId);
  const activeSession = useViewStore((s) => s.chatSessions.find((cs) => cs.id === s.activeSessionId));
  const setSessionWorkingDirectory = useViewStore((s) => s.setSessionWorkingDirectory);

  // Settings (for welcome message)
  const { data: settings } = useSettingsQuery();

  // #25 — Offline detection
  const isOnline = useOnlineStatus();

  // #19 — Message search (Ctrl+F)
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMatchId, setSearchMatchId] = useState<string | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // #20 — Auto-scroll indicator
  const { containerRef: autoScrollRef, bottomRef, showNewMessages, scrollToBottom } = useAutoScroll(messages.length);

  // Merge container refs
  const setChatRef = useCallback(
    (el: HTMLDivElement | null) => {
      (chatContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      (autoScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    },
    [autoScrollRef],
  );

  // ----- Per-session helpers -----------------------------------------------

  /** Update messages for a specific session. Only updates display if session is active. */
  const updateSessionMessages = useCallback((sessionId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    const prev = sessionMessagesRef.current[sessionId] ?? [];
    const updated = updater(prev);
    sessionMessagesRef.current[sessionId] = updated;

    if (sessionId === useViewStore.getState().activeSessionId) {
      setMessages(updated);
    }
  }, []);

  /** Set loading state for a specific session. Only updates display if session is active. */
  const setSessionLoading = useCallback((sessionId: string, loading: boolean) => {
    if (loading) {
      loadingSessionsRef.current.add(sessionId);
    } else {
      loadingSessionsRef.current.delete(sessionId);
    }

    if (sessionId === useViewStore.getState().activeSessionId) {
      setIsLoading(loading);
    }
  }, []);

  // ----- Session switch: save & restore messages ---------------------------

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    const cached = sessionMessagesRef.current[activeSessionId] ?? [];
    if (cached.length > 0) {
      setMessages(cached);
      setIsLoading(loadingSessionsRef.current.has(activeSessionId));
      return;
    }

    // Lazy-load from DB when sessionMessagesRef is empty (e.g. after page refresh)
    let cancelled = false;
    setIsLoading(true);
    apiGet<SessionDetail>(`/api/sessions/${activeSessionId}`)
      .then((detail) => {
        if (cancelled) return;
        const mapped: ChatMessage[] = detail.messages.map((m) => ({
          id: m.id,
          role: m.role as ChatMessage['role'],
          content: m.content,
          model: m.model ?? undefined,
          timestamp: new Date(m.timestamp),
          toolInteractions: m.tool_interactions?.map((ti) => ({
            id: ti.tool_use_id,
            toolName: ti.tool_name,
            toolInput: ti.tool_input,
            result: ti.result,
            isError: ti.is_error,
            status: 'completed' as const,
          })),
        }));
        sessionMessagesRef.current[activeSessionId] = mapped;
        setMessages(mapped);
      })
      .catch(() => {
        // Best-effort: session may not exist in DB yet (local-only)
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  // ----- Check Claude API connectivity on mount ----------------------------

  useEffect(() => {
    void claudeHealthCheck().then(setClaudeConnected);
  }, []);

  // ----- Ctrl+F search overlay (#19) ----------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSearchMatchChange = useCallback((messageId: string | null) => {
    setSearchMatchId(messageId);
    if (messageId) {
      const el = document.querySelector(`[data-message-id="${messageId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // ----- Paste handler (global) --------------------------------------------

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          e.preventDefault();
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // ----- Model selection adapter -------------------------------------------

  const modelOptions = useMemo(() => models.map(toModelOption), [models]);

  const handleModelSelect = useCallback((model: ModelOption) => {
    setSelectedModel(model.id);
  }, []);

  // ----- Clear chat --------------------------------------------------------

  const clearChat = useCallback(() => {
    if (activeSessionId) {
      sessionMessagesRef.current[activeSessionId] = [];
      loadingSessionsRef.current.delete(activeSessionId);
      // Abort any in-progress stream for this session
      abortControllersRef.current[activeSessionId]?.abort();
      delete abortControllersRef.current[activeSessionId];
    }
    setMessages([]);
    setIsLoading(false);
  }, [activeSessionId]);

  // ----- Copy entire session -----------------------------------------------

  const [sessionCopied, setSessionCopied] = useState(false);

  const handleCopySession = useCallback(async () => {
    if (messages.length === 0) return;

    const session = useViewStore.getState().chatSessions.find((s) => s.id === activeSessionId);
    const title = session?.title ?? 'Untitled';
    const date = session ? formatDateTime(session.createdAt) : '';

    const lines = [`=== ${title} ===`, date ? `Date: ${date}` : '', `Messages: ${messages.length}`, ''];
    for (const msg of messages) {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      const time = msg.timestamp instanceof Date ? formatTime(msg.timestamp) : '';
      const model = msg.model ? ` (${msg.model})` : '';
      lines.push(`[${role}] ${time}${model}:`);
      lines.push(msg.content);
      lines.push('');
    }

    const text = lines.join('\n');
    const ok = await copyToClipboard(text);
    if (ok) {
      toast.success('Session copied to clipboard');
      setSessionCopied(true);
      setTimeout(() => setSessionCopied(false), 2000);
    } else {
      toast.error('Failed to copy session');
    }
  }, [messages, activeSessionId]);

  // ----- Per-session working directory -------------------------------------

  const handleWorkingDirectoryChange = useCallback(
    (wd: string) => {
      if (activeSessionId) {
        setSessionWorkingDirectory(activeSessionId, wd);
      }
    },
    [activeSessionId, setSessionWorkingDirectory],
  );

  // ----- Prompt history for arrow-key navigation (global, SQL-backed) ------

  const { promptHistory, addPrompt } = usePromptHistory();

  // ----- Send message with streaming (extended for tool events) ------------

  const handleSend = useCallback(
    async (text: string, attachments: Attachment[]) => {
      // #25 — Block submission when offline
      if (!isOnline) {
        toast.error('You are offline. Cannot send messages.');
        return;
      }
      // Capture sessionId at send time — all updates target this session
      const sessionId = activeSessionId;
      if (!selectedModel || !sessionId) return;
      if (loadingSessionsRef.current.has(sessionId)) return;

      // Build content with file attachments
      let content = text;
      for (const att of attachments) {
        if (att.type === 'file') {
          content += `\n\n--- File: ${att.name} ---\n${att.content}`;
        }
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        attachments: attachments.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          content: a.content,
          mimeType: a.mimeType,
        })),
        timestamp: new Date(),
      };

      // Capture messages BEFORE adding new ones — used to build API context
      const previousMessages = [...(sessionMessagesRef.current[sessionId] ?? [])];

      // Auto-name session on first user message
      if (previousMessages.length === 0) {
        const autoTitle = text.trim().substring(0, 30) + (text.trim().length > 30 ? '...' : '');
        renameSessionWithSync(sessionId, autoTitle || 'New Chat');
      }

      updateSessionMessages(sessionId, (prev) => [...prev, userMessage]);
      addPrompt(text);
      setSessionLoading(sessionId, true);

      // Persist user message to DB immediately (crash-safe — Issue 2 fix)
      addMessageWithSync(sessionId, 'user', content, selectedModel);

      // Create placeholder assistant message
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        toolInteractions: [],
        timestamp: new Date(),
        model: selectedModel,
        streaming: true,
      };
      updateSessionMessages(sessionId, (prev) => [...prev, assistantMessage]);

      // AbortController for this stream
      const controller = new AbortController();
      abortControllersRef.current[sessionId] = controller;

      let responseBuffer = '';

      try {
        // Build history for context — include system prompt as first message
        // Per-session WD with fallback to global settings
        const sessionWd = useViewStore.getState().chatSessions.find((s) => s.id === sessionId)?.workingDirectory;
        const effectiveWd = sessionWd || settings?.working_directory;
        const chatHistory: Array<{ role: string; content: string }> = [
          { role: 'user', content: buildSystemPrompt(effectiveWd, i18n.language) },
          {
            role: 'assistant',
            content: 'Understood. I am ready to assist as a Witcher agent in the ClaudeHydra swarm.',
          },
        ];
        // Sliding window: last 20 messages, compress older ones to 500 chars (GH parity)
        const HISTORY_LIMIT = 20;
        const COMPRESS_KEEP_FULL = 6;
        const windowedMessages = previousMessages.slice(-HISTORY_LIMIT);
        for (let i = 0; i < windowedMessages.length; i++) {
          const m = windowedMessages[i]!;
          const isOld = i < windowedMessages.length - COMPRESS_KEEP_FULL;
          const msgContent =
            isOld && m.content.length > 500
              ? m.content.slice(0, 500) + '... [truncated for context efficiency]'
              : m.content;
          chatHistory.push({ role: m.role, content: msgContent });
        }
        chatHistory.push({ role: 'user', content });

        for await (const event of claudeStreamChat(
          selectedModel,
          chatHistory,
          toolsEnabled,
          sessionId,
          controller.signal,
        )) {
          // Dispatch based on event type
          if (event.type === 'tool_call') {
            // Add a new ToolInteraction in running state
            const ti: ToolInteraction = {
              id: event.tool_use_id ?? crypto.randomUUID(),
              toolName: event.tool_name ?? 'unknown',
              toolInput: event.tool_input ?? {},
              status: 'running',
            };

            updateSessionMessages(sessionId, (prev) => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg?.streaming) {
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMsg,
                    toolInteractions: [...(lastMsg.toolInteractions ?? []), ti],
                  },
                ];
              }
              return prev;
            });
          } else if (event.type === 'tool_result') {
            // Update existing ToolInteraction with result
            const toolUseId = event.tool_use_id;
            updateSessionMessages(sessionId, (prev) => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg?.streaming && lastMsg.toolInteractions) {
                const updatedInteractions = lastMsg.toolInteractions.map((ti) =>
                  ti.id === toolUseId
                    ? {
                        ...ti,
                        ...(event.result !== undefined && { result: event.result }),
                        ...(event.is_error !== undefined && { isError: event.is_error }),
                        status: (event.is_error ? 'error' : 'completed') as ToolInteraction['status'],
                      }
                    : ti,
                );
                return [...prev.slice(0, -1), { ...lastMsg, toolInteractions: updatedInteractions }];
              }
              return prev;
            });
          } else {
            // Text token (backward-compatible)
            const token = event.token ?? '';
            if (token) {
              responseBuffer += token;
            }

            updateSessionMessages(sessionId, (prev) => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg?.streaming) {
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMsg,
                    content: lastMsg.content + token,
                    streaming: !event.done,
                  },
                ];
              }
              return prev;
            });

            if (event.done) {
              setSessionLoading(sessionId, false);
              delete abortControllersRef.current[sessionId];
              // Persist assistant response to DB (user message already saved before streaming)
              if (responseBuffer) {
                addMessageWithSync(sessionId, 'assistant', responseBuffer, event.model ?? selectedModel);
              }
              // #8 — Background title generation: fire-and-forget with 2s delay
              if (previousMessages.length === 0) {
                setTimeout(() => {
                  generateTitleWithSync(sessionId).then(
                    () => {
                      /* title updated in store by generateTitleWithSync */
                    },
                    () => {
                      /* best-effort: substring title already set as placeholder */
                    },
                  );
                }, 2000);
              }
            }
          }
        }
      } catch (err) {
        // Ignore abort errors (user switched/cleared session)
        if (err instanceof DOMException && err.name === 'AbortError') {
          setSessionLoading(sessionId, false);
          delete abortControllersRef.current[sessionId];
          return;
        }
        console.error('Chat error:', err);
        toast.error('Failed to get response');
        updateSessionMessages(sessionId, (prev) => {
          const last = prev[prev.length - 1];
          if (last?.streaming) {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                content: `Error: ${err instanceof Error ? err.message : String(err)}`,
                streaming: false,
              },
            ];
          }
          return prev;
        });
        setSessionLoading(sessionId, false);
        delete abortControllersRef.current[sessionId];
      }
    },
    [
      selectedModel,
      activeSessionId,
      toolsEnabled,
      isOnline,
      settings,
      addMessageWithSync,
      renameSessionWithSync,
      generateTitleWithSync,
      updateSessionMessages,
      setSessionLoading,
      addPrompt,
      i18n.language,
    ],
  );

  // ----- Render -------------------------------------------------------------

  return (
    <div data-testid="chat-view" className="h-full flex flex-col p-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        data-testid="chat-header"
        className="flex items-center justify-between mb-4"
      >
        <div className="flex items-center gap-3">
          <Bot className="text-[var(--matrix-accent)]" size={24} />
          <div>
            <h2 className="text-lg font-semibold text-[var(--matrix-accent)] font-mono">
              {t('chat.title', 'Claude Chat')}
            </h2>
            <p data-testid="chat-status-text" className="text-xs text-[var(--matrix-text-secondary)]">
              {claudeConnected ? `${models.length} models available` : 'Offline — configure API key in Settings'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tools toggle */}
          <Button
            variant={toolsEnabled ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setToolsEnabled((v) => !v)}
            title={toolsEnabled ? 'File tools enabled' : 'File tools disabled'}
            aria-label={t('chat.toggleFileTools', 'Toggle file tools')}
            leftIcon={<Wrench size={14} />}
          >
            Tools
          </Button>

          {/* Model selector */}
          <ModelSelector
            models={modelOptions}
            selectedId={selectedModel || null}
            onSelect={handleModelSelect}
            disabled={!claudeConnected}
            placeholder={t('chat.selectModel', 'Select model')}
            className="w-56"
          />

          {/* Copy session */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopySession}
            disabled={messages.length === 0}
            title={t('chat.copySession', 'Copy entire session')}
            aria-label={t('chat.copySession', 'Copy entire session')}
            leftIcon={sessionCopied ? <Check size={14} className="text-emerald-400" /> : <ClipboardList size={14} />}
          >
            {sessionCopied ? 'Copied' : 'Copy'}
          </Button>

          {/* Clear chat */}
          <Button
            data-testid="chat-clear-btn"
            variant="ghost"
            size="sm"
            onClick={clearChat}
            title={t('chat.clearChat', 'Clear chat')}
            aria-label={t('chat.clearChat', 'Clear chat')}
            leftIcon={<Trash2 size={14} />}
          >
            Clear
          </Button>
        </div>
      </motion.div>

      {/* #1 Virtualized message area */}
      <VirtualizedMessageArea
        messages={messages}
        welcomeMessage={settings?.welcome_message}
        setChatRef={setChatRef}
        bottomRef={bottomRef}
        messagesEndRef={messagesEndRef}
        searchOpen={searchOpen}
        searchMatchId={searchMatchId}
        onSearchMatchChange={handleSearchMatchChange}
        onSearchClose={() => {
          setSearchOpen(false);
          setSearchMatchId(null);
        }}
        showNewMessages={showNewMessages}
        scrollToBottom={scrollToBottom}
      />

      {/* Streaming indicator bar */}
      {isLoading && (
        <motion.div
          data-testid="chat-streaming-bar"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          className="h-0.5 bg-gradient-to-r from-transparent via-[var(--matrix-accent)] to-transparent origin-left mt-1 rounded-full"
        />
      )}

      {/* Chat input — #25 disabled when offline */}
      <div className="mt-3">
        <ChatInput
          onSend={handleSend}
          disabled={!claudeConnected || !selectedModel || !isOnline}
          isLoading={isLoading}
          placeholder={
            !isOnline
              ? t('chat.offlinePlaceholder', 'You are offline')
              : claudeConnected
                ? 'Type a message... (Shift+Enter = new line)'
                : 'Configure API key in Settings'
          }
          promptHistory={promptHistory}
          sessionId={activeSessionId ?? undefined}
          workingDirectory={activeSession?.workingDirectory}
          onWorkingDirectoryChange={handleWorkingDirectoryChange}
        />
      </div>
    </div>
  );
}

export default ClaudeChatView;
