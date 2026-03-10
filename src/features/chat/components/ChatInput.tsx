// src/features/chat/components/ChatInput.tsx

import { BaseChatInput, type BaseChatInputHandle, cn } from '@jaskier/ui';
import { FolderOpen, Send, StopCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/atoms';
import { WorkingFolderPicker } from './WorkingFolderPicker';

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'file';
  content: string;
  mimeType?: string;
}

export interface ChatInputHandle {
  focus: () => void;
  setValue: (value: string) => void;
}

interface ChatInputProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  promptHistory?: string[];
  sessionId?: string;
  workingDirectory?: string;
  onWorkingDirectoryChange?: (wd: string) => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  (
    {
      onSend,
      disabled = false,
      isLoading = false,
      placeholder,
      promptHistory = [],
      sessionId,
      workingDirectory,
      onWorkingDirectoryChange,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const baseInputRef = useRef<BaseChatInputHandle>(null);
    const [value, setValue] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);

    useImperativeHandle(ref, () => ({
      focus: () => baseInputRef.current?.focus(),
      setValue: (val: string) => {
        setValue(val);
        baseInputRef.current?.setValue(val);
      },
    }));

    const canSubmit = !disabled && !isLoading && (value.trim().length > 0 || attachments.length > 0);

    const handleSubmit = useCallback(
      (val: string) => {
        if (!canSubmit) return;
        onSend(val.trim(), attachments);
        setValue('');
        setAttachments([]);
        baseInputRef.current?.clear();
      },
      [canSubmit, onSend, attachments],
    );

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (const file of Array.from(files)) {
        const reader = new FileReader();
        const isImage = file.type.startsWith('image/');
        reader.onload = () => {
          const content = reader.result as string;
          setAttachments((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              name: file.name,
              type: isImage ? 'image' : 'file',
              content: isImage ? content : content,
              mimeType: file.type,
            },
          ]);
        };
        if (isImage) {
          reader.readAsDataURL(file);
        } else {
          reader.readAsText(file);
        }
      }
      e.target.value = '';
    }, []);

    return (
      <section className="flex flex-col relative transition-all duration-300 z-10 w-full">
        <BaseChatInput
          ref={baseInputRef}
          value={value}
          onChange={setValue}
          onSend={handleSubmit}
          disabled={disabled || isLoading}
          placeholder={placeholder ?? t('chat.typeMessage', 'Type a message... (Shift+Enter = new line)')}
          promptHistory={promptHistory}
          topActions={
            <>
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 w-full mb-2">
                  {attachments.map((att) => (
                    <motion.div
                      key={att.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono',
                        'bg-[var(--matrix-accent)]/10 border border-[var(--matrix-accent)]/20',
                      )}
                    >
                      <span className="truncate max-w-[120px]">{att.name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                        className="text-[var(--matrix-text-secondary)] hover:text-red-400 transition-colors"
                        aria-label={`Remove ${att.name}`}
                      >
                        ×
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
              {sessionId && onWorkingDirectoryChange && (
                <WorkingFolderPicker
                  sessionId={sessionId}
                  workingDirectory={workingDirectory ?? ''}
                  onDirectoryChange={onWorkingDirectoryChange}
                />
              )}
            </>
          }
          leftActions={
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept="image/*,.txt,.md,.ts,.tsx,.js,.jsx,.json,.css,.html,.py,.rs,.toml,.yaml,.yml,.xml,.csv,.log,.sh,.bat,.sql,.env"
              />
              <Button
                type="button"
                variant="ghost"
                size="md"
                aria-label="Attach local file"
                aria-keyshortcuts="Ctrl+O"
                onClick={() => fileInputRef.current?.click()}
                title={t('chat.attachLocalFile', 'Attach local file')}
              >
                <FolderOpen size={20} />
              </Button>
            </>
          }
          rightActions={
            <AnimatePresence mode="wait">
              {isLoading ? (
                <Button
                  key="stop"
                  type="button"
                  variant="danger"
                  size="md"
                  aria-label="Stop generation"
                  title={t('chat.stopGeneration', 'Stop generation')}
                >
                  <StopCircle size={20} className="animate-pulse" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  key="send"
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={!canSubmit}
                  aria-label="Send message"
                  aria-disabled={!canSubmit}
                  onClick={() => handleSubmit(value)}
                  title={t('chat.send', 'Send')}
                >
                  <Send size={20} strokeWidth={2.5} className="ml-0.5" aria-hidden="true" />
                </Button>
              )}
            </AnimatePresence>
          }
        />
      </section>
    );
  },
);

ChatInput.displayName = 'ChatInput';
export default ChatInput;
