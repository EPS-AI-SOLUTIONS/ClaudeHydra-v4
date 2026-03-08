import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { BaseMessageBubble } from '@jaskier/ui';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { ToolCallBlock, type ToolInteraction } from './ToolCallBlock';

interface MessageAttachment {
  id: string;
  name: string;
  type: 'file' | 'image';
  content: string;
  mimeType: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  attachments?: MessageAttachment[];
  toolInteractions?: ToolInteraction[];
  timestamp: Date;
  model?: string;
  streaming?: boolean;
}

interface MessageBubbleProps {
  message: ChatMessage;
  className?: string;
}

export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const { t } = useTranslation();
  const theme = useViewTheme();

  return (
    <BaseMessageBubble
      message={{
        id: message.id,
        role: message.role as any,
        content: message.content,
        isStreaming: message.streaming,
        timestamp: message.timestamp.getTime(),
      }}
      theme={{
        isLight: theme.isLight,
        bubbleAssistant: theme.isLight
          ? 'bg-white/50 border border-white/30 text-black shadow-sm'
          : 'bg-black/40 border border-[var(--glass-border)] text-white shadow-lg backdrop-blur-sm',
        bubbleUser: theme.isLight
          ? 'bg-emerald-500/15 border border-emerald-500/20 text-black'
          : 'bg-[var(--matrix-accent)]/15 border border-[var(--matrix-accent)]/20 text-white',
        accentText: theme.accentText,
        accentBg: theme.accentBg,
        textMuted: theme.textMuted,
      }}
      copyText={t('chat.copyMessage', 'Copy message')}
      copiedText={t('common.copied', 'Copied')}
      modelBadge={message.model}
      toolInteractions={
        message.toolInteractions && message.toolInteractions.length > 0 ? (
          <div className="mb-3">
            {message.toolInteractions.map((ti) => (
              <ToolCallBlock key={ti.id} interaction={ti} />
            ))}
          </div>
        ) : undefined
      }
    />
  );
});

MessageBubble.displayName = 'MessageBubble';

