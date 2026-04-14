import {
  splitToolOutput,
  stripParallelHeader,
  useViewTheme,
} from '@jaskier/chat-module';
import { AgentAvatar, cn } from '@jaskier/ui';
import { BaseMessageBubble } from '@jaskier/ui/markdown';
import { memo, useDeferredValue, useMemo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { useCurrentSession } from '@/stores/viewStore';
import RefreshCw from '~icons/lucide/refresh-cw';
import { ErrorBoundary } from './ErrorBoundary';
import { MessageRating } from './MessageRating';
import { ToolResultRenderer } from './ToolResultRenderer';
export const MessageBubble = memo(
  ({ message, isLast, isStreaming, onContextMenu, onRetry }) => {
    const { t } = useTranslation();
    const theme = useViewTheme();
    const currentSessionId = useCurrentSession()?.id;
    const deferredContent = useDeferredValue(message.content);
    const cleanedContent = useMemo(
      () => stripParallelHeader(deferredContent),
      [deferredContent],
    );
    const segments = useMemo(
      () => splitToolOutput(cleanedContent),
      [cleanedContent],
    );
    const textContent = useMemo(
      () =>
        segments
          .filter((s) => s.type === 'text')
          .map((s) => s.content)
          .join('\n'),
      [segments],
    );
    const toolSegments = useMemo(
      () => segments.filter((s) => s.type === 'tool'),
      [segments],
    );
    const status = useMemo(() => {
      if (message.error) return 'error';
      if (isStreaming && isLast) return message.content ? 'typing' : 'thinking';
      return 'idle';
    }, [message.error, isStreaming, isLast, message.content]);
    const assistantBubbleClasses = theme.isLight
      ? 'bg-white/50 border border-white/30 text-black shadow-sm'
      : 'bg-black/40 border border-[var(--glass-border)] text-white shadow-lg backdrop-blur-sm';
    const userBubbleClasses = theme.isLight
      ? 'bg-emerald-500/15 border border-emerald-500/20 text-black'
      : 'bg-[var(--matrix-accent)]/15 border border-[var(--matrix-accent)]/20 text-white';
    const isPending = message.status === 'pending';
    const isError = message.status === 'error';
    return _jsx(ErrorBoundary, {
      name: 'MessageBubble',
      children: _jsxs('article', {
        onContextMenu: (e) => onContextMenu?.(e, message),
        children: [
          _jsx('div', {
            className: cn(
              isPending &&
                'opacity-70 animate-[optimistic-pulse_2s_ease-in-out_infinite]',
              isError && 'border-l-2 border-red-500 pl-1',
            ),
            children: _jsx(BaseMessageBubble, {
              message: {
                id: message.id || '',
                role: message.role,
                content: textContent,
                isStreaming: isStreaming && isLast,
                timestamp: message.timestamp,
              },
              theme: {
                isLight: theme.isLight,
                bubbleAssistant: assistantBubbleClasses,
                bubbleUser: userBubbleClasses,
                accentText: theme.accentText,
                accentBg: theme.accentBg,
                textMuted: theme.textMuted,
              },
              avatar:
                message.role === 'assistant'
                  ? _jsx(AgentAvatar, { state: status })
                  : undefined,
              copyText: t('chat.copyMessage', 'Copy message'),
              copiedText: t('common.copied', 'Copied'),
              modelBadge: message.model,
              toolInteractions:
                toolSegments.length > 0
                  ? _jsx(ToolResultRenderer, {
                      segments: toolSegments,
                      isLight: theme.isLight,
                    })
                  : undefined,
            }),
          }),
          isError &&
            message.role === 'user' &&
            onRetry &&
            _jsx('div', {
              className: 'flex justify-end mt-1 mr-2',
              children: _jsxs('button', {
                type: 'button',
                onClick: () => onRetry(message),
                className:
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors',
                children: [
                  _jsx(RefreshCw, { width: 12, height: 12 }),
                  t('chat.retry', 'Retry'),
                ],
              }),
            }),
          !isStreaming &&
            message.role === 'assistant' &&
            currentSessionId &&
            message.id &&
            _jsx('div', {
              className: 'flex justify-start ml-14 mb-4',
              children: _jsx(MessageRating, {
                sessionId: currentSessionId,
                messageId: message.id,
              }),
            }),
        ],
      }),
    });
  },
);
MessageBubble.displayName = 'MessageBubble';
