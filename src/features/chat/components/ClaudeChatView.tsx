/**
 * ClaudeChatView — Full chat interface for Claude API with NDJSON streaming.
 *
 * Supports agentic tool_use loop: when tools are enabled, Claude can invoke
 * local file tools (read, list, write, search) and results are displayed
 * inline as collapsible ToolCallBlock panels.
 */

import { Bot, Check, ClipboardList, MessageSquare, Trash2, Wrench } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/atoms/Button';
import { EmptyState } from '@/components/molecules/EmptyState';
import { type ModelOption, ModelSelector } from '@/components/molecules/ModelSelector';
import { type ClaudeModel, useClaudeModels, FALLBACK_CLAUDE_MODELS } from '@/features/chat/hooks/useClaudeModels';
import { useSessionSync } from '@/features/chat/hooks/useSessionSync';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
import { env } from '@/shared/config/env';
import { copyToClipboard } from '@/shared/utils/clipboard';
import { cn } from '@/shared/utils/cn';
import { useViewStore } from '@/stores/viewStore';
import { type Attachment, ChatInput } from './ChatInput';
import { type ChatMessage, MessageBubble } from './MessageBubble';
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

const SYSTEM_PROMPT = [
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
].join('\n');

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
        description={t('chat.selectModelAndType', 'Select a model and type a message. Drag and drop files to add context.')}
      />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ClaudeChatView component
// ---------------------------------------------------------------------------

export function ClaudeChatView() {
  const { t } = useTranslation();

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
  const { addMessageWithSync, renameSessionWithSync } = useSessionSync();
  const activeSessionId = useViewStore((s) => s.activeSessionId);

  // Settings (for welcome message)
  const { data: settings } = useSettingsQuery();

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // ----- Per-session helpers -----------------------------------------------

  /** Update messages for a specific session. Only updates display if session is active. */
  const updateSessionMessages = useCallback(
    (sessionId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      const prev = sessionMessagesRef.current[sessionId] ?? [];
      const updated = updater(prev);
      sessionMessagesRef.current[sessionId] = updated;

      if (sessionId === useViewStore.getState().activeSessionId) {
        setMessages(updated);
      }
    },
    [],
  );

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
    if (activeSessionId) {
      const cached = sessionMessagesRef.current[activeSessionId] ?? [];
      setMessages(cached);
      setIsLoading(loadingSessionsRef.current.has(activeSessionId));
    } else {
      setMessages([]);
      setIsLoading(false);
    }
  }, [activeSessionId]);

  // ----- Check Claude API connectivity on mount ----------------------------

  useEffect(() => {
    void claudeHealthCheck().then(setClaudeConnected);
  }, []);

  // ----- Auto-scroll -------------------------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll must fire on every message update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    const date = session ? new Date(session.createdAt).toLocaleString() : '';

    const lines = [`=== ${title} ===`, date ? `Date: ${date}` : '', `Messages: ${messages.length}`, ''];
    for (const msg of messages) {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      const time = msg.timestamp instanceof Date ? msg.timestamp.toLocaleTimeString() : '';
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

  // ----- Prompt history for arrow-key navigation ---------------------------

  const promptHistory = useMemo(() => messages.filter((m) => m.role === 'user').map((m) => m.content), [messages]);

  // ----- Send message with streaming (extended for tool events) ------------

  const handleSend = useCallback(
    async (text: string, attachments: Attachment[]) => {
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
      setSessionLoading(sessionId, true);

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
        const chatHistory: Array<{ role: string; content: string }> = [
          { role: 'user', content: SYSTEM_PROMPT },
          {
            role: 'assistant',
            content: 'Understood. I am ready to assist as a Witcher agent in the ClaudeHydra swarm.',
          },
        ];
        // Use messages captured before the new user/assistant were added
        for (const m of previousMessages) {
          chatHistory.push({ role: m.role, content: m.content });
        }
        chatHistory.push({ role: 'user', content });

        for await (const event of claudeStreamChat(selectedModel, chatHistory, toolsEnabled, controller.signal)) {
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
              // Persist to DB
              addMessageWithSync(sessionId, 'user', content, selectedModel);
              if (responseBuffer) {
                addMessageWithSync(sessionId, 'assistant', responseBuffer, event.model ?? selectedModel);
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
    [selectedModel, activeSessionId, toolsEnabled, addMessageWithSync, renameSessionWithSync, updateSessionMessages, setSessionLoading],
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
            <h2 className="text-lg font-semibold text-[var(--matrix-accent)] font-mono">{t('chat.title', 'Claude Chat')}</h2>
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

      {/* Chat message area */}
      <div
        ref={chatContainerRef}
        data-testid="chat-message-area"
        className={cn('flex-1 p-4 overflow-y-auto relative transition-all rounded-lg', 'scrollbar-thin')}
      >
        {messages.length === 0 ? (
          settings?.welcome_message ? (
            <div className="space-y-4">
              <MessageBubble
                message={{
                  id: 'welcome',
                  role: 'assistant',
                  content: settings.welcome_message,
                  timestamp: new Date(),
                }}
              />
            </div>
          ) : (
            <EmptyChatState />
          )
        ) : (
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Streaming indicator bar */}
      {isLoading && (
        <motion.div
          data-testid="chat-streaming-bar"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          className="h-0.5 bg-gradient-to-r from-transparent via-[var(--matrix-accent)] to-transparent origin-left mt-1 rounded-full"
        />
      )}

      {/* Chat input */}
      <div className="mt-3">
        <ChatInput
          onSend={handleSend}
          disabled={!claudeConnected || !selectedModel}
          isLoading={isLoading}
          placeholder={claudeConnected ? 'Type a message... (Shift+Enter = new line)' : 'Configure API key in Settings'}
          promptHistory={promptHistory}
        />
      </div>
    </div>
  );
}

export default ClaudeChatView;
