/**
 * ChatInput — Composable textarea input with send button, file attachment,
 * and keyboard shortcut support.
 *
 * Ported from ClaudeHydra v3 `OllamaChatView.tsx` inline input area.
 * ClaudeHydra-v4: Extracted as a standalone component for reuse and testing.
 */

import { FileText, Loader2, Paperclip, Send, X } from 'lucide-react';
import { motion } from 'motion/react';
import {
  type ChangeEvent,
  type DragEvent,
  forwardRef,
  type KeyboardEvent,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { cn } from '@/shared/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Attachment {
  id: string;
  name: string;
  type: 'file' | 'image';
  content: string;
  mimeType: string;
}

export interface ChatInputProps {
  /** Called when the user submits the message */
  onSend: (message: string, attachments: Attachment[]) => void;
  /** Whether the input should be disabled (e.g. during streaming) */
  disabled?: boolean;
  /** Whether the chat is currently loading / streaming */
  isLoading?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Extra CSS classes on root wrapper */
  className?: string;
}

export interface ChatInputHandle {
  focus: () => void;
  clear: () => void;
}

// ---------------------------------------------------------------------------
// File accept list
// ---------------------------------------------------------------------------

const FILE_ACCEPT = 'image/*,.txt,.md,.json,.js,.ts,.py,.rs,.go,.java,.cpp,.c,.h,.css,.html,.xml,.yaml,.yml,.toml,.sh';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  (
    {
      onSend,
      disabled = false,
      isLoading = false,
      placeholder = 'Type a message... (Shift+Enter = new line)',
      className,
    },
    ref,
  ) => {
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Expose imperative methods
    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      clear: () => {
        setInput('');
        setAttachments([]);
      },
    }));

    // ----- File processing ------------------------------------------------

    const processFile = useCallback(async (file: File) => {
      const reader = new FileReader();
      return new Promise<void>((resolve) => {
        reader.onload = (e) => {
          const content = e.target?.result as string;
          const isImage = file.type.startsWith('image/');
          const attachment: Attachment = {
            id: crypto.randomUUID(),
            name: file.name,
            type: isImage ? 'image' : 'file',
            content,
            mimeType: file.type,
          };
          setAttachments((prev) => [...prev, attachment]);
          resolve();
        };
        if (file.type.startsWith('image/')) {
          reader.readAsDataURL(file);
        } else {
          reader.readAsText(file);
        }
      });
    }, []);

    const handleFileInput = useCallback(
      async (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
          for (const file of Array.from(files)) {
            await processFile(file);
          }
        }
        // Reset input so same file can be re-selected
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
      [processFile],
    );

    const removeAttachment = useCallback((id: string) => {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    }, []);

    // ----- Drag & Drop ---------------------------------------------------

    const handleDrop = useCallback(
      async (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        for (const file of files) {
          await processFile(file);
        }
      },
      [processFile],
    );

    const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
    }, []);

    // ----- Send logic ----------------------------------------------------

    const canSend = (input.trim().length > 0 || attachments.length > 0) && !disabled && !isLoading;

    const handleSend = useCallback(() => {
      if (!canSend) return;
      onSend(input.trim(), attachments);
      setInput('');
      setAttachments([]);
      // Re-focus textarea
      requestAnimationFrame(() => textareaRef.current?.focus());
    }, [canSend, input, attachments, onSend]);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      },
      [handleSend],
    );

    // ----- Auto-resize textarea ------------------------------------------

    const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      // Auto-resize
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }, []);

    // ----- Render --------------------------------------------------------

    return (
      <section
        className={cn('flex flex-col gap-2', className)}
        aria-label="Chat input area"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Drag overlay indicator */}
        {isDragging && (
          <div className="flex items-center justify-center py-3 px-4 glass-panel border-dashed border-2 border-[var(--matrix-accent)] bg-[var(--matrix-accent)]/5 rounded-lg">
            <Paperclip size={18} className="text-[var(--matrix-accent)] mr-2" />
            <span className="text-sm text-[var(--matrix-accent)]">Drop files here</span>
          </div>
        )}

        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((att) => (
              <motion.div
                key={att.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-2 px-3 py-2 bg-[var(--matrix-bg-secondary)] border border-[var(--matrix-accent)]/30 rounded-lg"
              >
                {att.type === 'image' ? (
                  <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
                    <img src={att.content} alt={att.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <FileText size={16} className="text-blue-400 flex-shrink-0" />
                )}
                <span className="text-sm truncate max-w-[150px] text-[var(--matrix-text-primary)]">{att.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-error)] transition-colors"
                  aria-label={`Remove ${att.name}`}
                >
                  <X size={14} />
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="flex gap-2 items-end">
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInput}
            multiple
            accept={FILE_ACCEPT}
            className="hidden"
            tabIndex={-1}
          />

          {/* Attach button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className={cn(
              'glass-button p-2.5 rounded-lg flex-shrink-0 transition-colors',
              'hover:text-[var(--matrix-accent)]',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
            title="Attach file"
            aria-label="Attach file"
          >
            <Paperclip size={18} />
          </button>

          {/* Textarea */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className={cn(
                'w-full glass-input px-4 py-3 resize-none rounded-lg font-mono text-sm',
                'text-[var(--matrix-text-primary)] placeholder:text-[var(--matrix-text-secondary)]/60',
                'focus:border-[var(--matrix-accent)] focus:ring-2 focus:ring-[var(--matrix-accent)]/30',
                'outline-none transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              style={{ minHeight: '48px', maxHeight: '200px' }}
            />
          </div>

          {/* Send button */}
          <motion.button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            whileHover={canSend ? { scale: 1.05 } : undefined}
            whileTap={canSend ? { scale: 0.95 } : undefined}
            className={cn(
              'glass-button glass-button-primary p-2.5 rounded-lg flex-shrink-0 transition-all',
              canSend
                ? 'text-[var(--matrix-accent)] hover:shadow-[0_0_15px_var(--matrix-accent)]'
                : 'opacity-50 cursor-not-allowed',
            )}
            title="Send message"
            aria-label="Send message"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </motion.button>
        </div>
      </section>
    );
  },
);

ChatInput.displayName = 'ChatInput';
