/**
 * ChatHeader — Header bar for the Claude chat view.
 *
 * Displays the title, connection status, model selector, tools toggle,
 * copy session button, and clear chat button.
 *
 * Extracted from ClaudeChatView.tsx to reduce component file size.
 */
import { Button } from '@jaskier/ui';
import { Bot, Check, ClipboardList, Trash2, Wrench } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useCallback, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ModelSelector } from '@/components/molecules/ModelSelector';
import { copyToClipboard } from '@/shared/utils/clipboard';
import { formatDateTime, formatTime } from '@/shared/utils/locale';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const ChatHeader = memo(function ChatHeader({
  claudeConnected,
  modelCount,
  modelOptions,
  selectedModel,
  onModelSelect,
  toolsEnabled,
  onToolsToggle,
  messages,
  activeSessionTitle,
  activeSessionCreatedAt,
  onClearChat,
  wsConnectionStatus,
  wsConnectionGaveUp,
  onWsReconnect,
}) {
  const { t } = useTranslation();
  const [sessionCopied, setSessionCopied] = useState(false);
  const handleCopySession = useCallback(async () => {
    if (messages.length === 0) return;
    const title = activeSessionTitle ?? 'Untitled';
    const date = activeSessionCreatedAt ? formatDateTime(activeSessionCreatedAt) : '';
    const lines = [`=== ${title} ===`, date ? `Date: ${date}` : '', `Messages: ${messages.length}`, ''];
    for (const msg of messages) {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      const time = typeof msg.timestamp === 'number' ? formatTime(new Date(msg.timestamp)) : '';
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
  }, [messages, activeSessionTitle, activeSessionCreatedAt]);
  return _jsxs(motion.div, {
    initial: { opacity: 0, y: -10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.25 },
    'data-testid': 'chat-header',
    className: 'flex items-center justify-between mb-4',
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-3',
        children: [
          _jsx(Bot, { className: 'text-[var(--matrix-accent)]', size: 24 }),
          _jsxs('div', {
            children: [
              _jsx('h2', {
                className: 'text-lg font-semibold text-[var(--matrix-accent)] font-mono',
                children: t('chat.title', 'Claude Chat'),
              }),
              _jsxs('div', {
                className: 'flex items-center gap-2',
                children: [
                  _jsx('p', {
                    'data-testid': 'chat-status-text',
                    className: 'text-xs text-[var(--matrix-text-secondary)]',
                    children: claudeConnected
                      ? `${modelCount} models available`
                      : 'Offline — configure API key in Settings',
                  }),
                  wsConnectionStatus &&
                    onWsReconnect &&
                    _jsx(ConnectionStatusBadge, {
                      connectionStatus: wsConnectionStatus,
                      connectionGaveUp: wsConnectionGaveUp ?? false,
                      onReconnect: onWsReconnect,
                    }),
                ],
              }),
            ],
          }),
        ],
      }),
      _jsxs('div', {
        className: 'flex items-center gap-3',
        children: [
          _jsx(Button, {
            variant: toolsEnabled ? 'primary' : 'ghost',
            size: 'sm',
            onClick: onToolsToggle,
            title: toolsEnabled ? 'File tools enabled' : 'File tools disabled',
            'aria-label': t('chat.toggleFileTools', 'Toggle file tools'),
            leftIcon: _jsx(Wrench, { size: 14 }),
            children: 'Tools',
          }),
          _jsx(ModelSelector, {
            models: modelOptions,
            selectedId: selectedModel,
            onSelect: onModelSelect,
            disabled: !claudeConnected,
            placeholder: t('chat.selectModel', 'Select model'),
            className: 'w-56',
          }),
          _jsx(Button, {
            variant: 'ghost',
            size: 'sm',
            onClick: handleCopySession,
            disabled: messages.length === 0,
            title: t('chat.copySession', 'Copy entire session'),
            'aria-label': t('chat.copySession', 'Copy entire session'),
            leftIcon: sessionCopied
              ? _jsx(Check, { size: 14, className: 'text-emerald-400' })
              : _jsx(ClipboardList, { size: 14 }),
            children: sessionCopied ? 'Copied' : 'Copy',
          }),
          _jsx(Button, {
            'data-testid': 'chat-clear-btn',
            variant: 'ghost',
            size: 'sm',
            onClick: onClearChat,
            title: t('chat.clearChat', 'Clear chat'),
            'aria-label': t('chat.clearChat', 'Clear chat'),
            leftIcon: _jsx(Trash2, { size: 14 }),
            children: 'Clear',
          }),
        ],
      }),
    ],
  });
});
ChatHeader.displayName = 'ChatHeader';
