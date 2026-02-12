/**
 * OllamaChatView — Full chat interface for Ollama + Claude API.
 *
 * Ported from ClaudeHydra v3 `web/src/components/OllamaChatView.tsx`.
 * ClaudeHydra-v4: Decomposed into ChatInput + MessageBubble sub-components,
 * uses ModelSelector molecule, motion animations, NDJSON streaming (placeholder),
 * and green Matrix theme throughout.
 */

import { Bot, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { type ModelOption, ModelSelector } from '@/components/molecules/ModelSelector';
import { cn } from '@/shared/utils/cn';
import { type Attachment, ChatInput } from './ChatInput';
import { type ChatMessage, MessageBubble } from './MessageBubble';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OllamaModel {
  name: string;
  modified_at?: string;
  size?: number;
}

interface StreamChunk {
  id: string;
  token: string;
  done: boolean;
  model?: string;
  total_tokens?: number;
}

// ---------------------------------------------------------------------------
// API helpers (placeholder — to be wired to real API layer)
// ---------------------------------------------------------------------------

const OLLAMA_PROXY = '/api/ollama';

async function ollamaHealthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_PROXY}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

async function ollamaListModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${OLLAMA_PROXY}/api/tags`);
  if (!res.ok) throw new Error('Failed to fetch models');
  const data: { models?: OllamaModel[] } = await res.json();
  return data.models ?? [];
}

/**
 * NDJSON streaming chat — reads newline-delimited JSON from Ollama.
 * Each line is a JSON object with `message.content` and `done` fields.
 */
async function* ollamaStreamChat(
  model: string,
  messages: Array<{ role: string; content: string }>,
): AsyncGenerator<StreamChunk> {
  const res = await fetch(`${OLLAMA_PROXY}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
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
        const chunk: { message?: { content?: string }; done?: boolean; model?: string; eval_count?: number } =
          JSON.parse(line);
        yield {
          id: crypto.randomUUID(),
          token: chunk.message?.content ?? '',
          done: chunk.done ?? false,
          model: chunk.model,
          total_tokens: chunk.eval_count,
        };
      } catch {
        // Ignore NDJSON parse errors on partial lines
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Model option adapter
// ---------------------------------------------------------------------------

function toModelOption(m: OllamaModel): ModelOption {
  return {
    id: m.name,
    name: m.name,
    provider: 'ollama',
    available: true,
    description: m.size ? `${(m.size / 1_073_741_824).toFixed(1)} GB` : undefined,
  };
}

// ---------------------------------------------------------------------------
// Empty state sub-component
// ---------------------------------------------------------------------------

function EmptyChatState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      data-testid="chat-empty-state"
      className="h-full flex items-center justify-center text-[var(--matrix-text-secondary)]"
    >
      <div className="text-center">
        <Bot size={64} className="mx-auto mb-4 opacity-30 text-[var(--matrix-accent)]" />
        <p className="text-lg mb-2 text-[var(--matrix-text-primary)]">Start a conversation</p>
        <p className="text-sm">Select a model and type a message</p>
        <p className="text-xs mt-4 opacity-70">Drag and drop files to add context</p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// OllamaChatView component
// ---------------------------------------------------------------------------

export function OllamaChatView() {
  // Model state
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [ollamaConnected, setOllamaConnected] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const responseBufferRef = useRef<string>('');

  // ----- Load models on mount -------------------------------------------

  useEffect(() => {
    const loadModels = async () => {
      try {
        const healthy = await ollamaHealthCheck();
        setOllamaConnected(healthy);
        if (healthy) {
          const result = await ollamaListModels();
          if (result.length > 0) {
            setModels(result);
          }
        }
      } catch (err) {
        console.error('Failed to load models:', err);
        setOllamaConnected(false);
      }
    };
    void loadModels();
  }, []);

  // Auto-select first model
  useEffect(() => {
    if (selectedModel || models.length === 0) return;
    const first = models[0];
    if (first) {
      setSelectedModel(first.name);
    }
  }, [models, selectedModel]);

  // ----- Auto-scroll ----------------------------------------------------
  // We intentionally depend on `messages` to scroll on every change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll must fire on every message update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ----- Paste handler (global) -----------------------------------------

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          e.preventDefault();
          // File paste is handled by ChatInput
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // ----- Model selection adapter ----------------------------------------

  const modelOptions = models.map(toModelOption);

  const handleModelSelect = useCallback((model: ModelOption) => {
    setSelectedModel(model.id);
  }, []);

  // ----- Clear chat -----------------------------------------------------

  const clearChat = useCallback(() => {
    setMessages([]);
    setIsLoading(false);
  }, []);

  // ----- Send message with streaming ------------------------------------

  const handleSend = useCallback(
    async (text: string, attachments: Attachment[]) => {
      if (!selectedModel || isLoading) return;

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

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      // Create placeholder assistant message
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        model: selectedModel,
        streaming: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      try {
        // Build history for context
        const chatHistory = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        chatHistory.push({ role: 'user', content });

        responseBufferRef.current = '';

        for await (const chunk of ollamaStreamChat(selectedModel, chatHistory)) {
          responseBufferRef.current += chunk.token;

          setMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.streaming) {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMsg,
                  content: lastMsg.content + chunk.token,
                  streaming: !chunk.done,
                },
              ];
            }
            return prev;
          });

          if (chunk.done) {
            setIsLoading(false);
            responseBufferRef.current = '';
          }
        }
      } catch (err) {
        console.error('Chat error:', err);
        setMessages((prev) => {
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
        setIsLoading(false);
      }
    },
    [selectedModel, isLoading, messages],
  );

  // ----- Render ----------------------------------------------------------

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
            <h2 className="text-lg font-semibold text-[var(--matrix-accent)] font-mono">Ollama Chat</h2>
            <p data-testid="chat-status-text" className="text-xs text-[var(--matrix-text-secondary)]">
              {ollamaConnected
                ? `${models.length} model${models.length === 1 ? '' : 's'} available`
                : 'Offline — start Ollama to connect'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Model selector */}
          <ModelSelector
            models={modelOptions}
            selectedId={selectedModel || null}
            onSelect={handleModelSelect}
            disabled={!ollamaConnected || models.length === 0}
            placeholder="Select model"
            className="w-56"
          />

          {/* Clear chat */}
          <Button
            data-testid="chat-clear-btn"
            variant="ghost"
            size="sm"
            onClick={clearChat}
            title="Clear chat"
            aria-label="Clear chat"
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
        className={cn('flex-1 glass-panel p-4 overflow-y-auto relative transition-all rounded-lg', 'scrollbar-thin')}
      >
        {messages.length === 0 ? (
          <EmptyChatState />
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
          disabled={!ollamaConnected || !selectedModel}
          isLoading={isLoading}
          placeholder={ollamaConnected ? 'Type a message... (Shift+Enter = new line)' : 'Ollama is offline'}
        />
      </div>
    </div>
  );
}

export default OllamaChatView;
