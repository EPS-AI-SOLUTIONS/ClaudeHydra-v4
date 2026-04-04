/**
 * ChatInput â€” Composable textarea input with send button, file attachment,
 * and keyboard shortcut support.
 *
 * Ported from ClaudeHydra v3 `OllamaChatView.tsx` inline input area.
 * ClaudeHydra: Extracted as a standalone component for reuse and testing.
 * Refactored to use @jaskier/ui BaseChatInput.
 */
import { BaseChatInput, cn } from '@jaskier/ui';
import { Loader2, Paperclip, Send } from 'lucide-react';
import { motion } from 'motion/react';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { AttachmentPreview } from './AttachmentPreview';
import { WorkingFolderPicker } from './WorkingFolderPicker';

const FILE_ACCEPT = 'image/*,.txt,.md,.json,.js,.ts,.py,.rs,.go,.java,.cpp,.c,.h,.css,.html,.xml,.yaml,.yml,.toml,.sh';
export const ChatInput = forwardRef(
  (
    {
      onSend,
      disabled = false,
      isLoading = false,
      placeholder = 'Type a message... (Shift+Enter = new line)',
      className,
      promptHistory = [],
      sessionId,
      workingDirectory,
      onWorkingDirectoryChange,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);
    const baseInputRef = useRef(null);
    const handleSend = useCallback(
      (val) => {
        const text = val.trim();
        if (!text && attachments.length === 0) return;
        onSend(text, attachments);
        setInput('');
        setAttachments([]);
        baseInputRef.current?.clear();
      },
      [onSend, attachments],
    );
    useImperativeHandle(ref, () => ({
      focus: () => baseInputRef.current?.focus(),
      clear: () => {
        setInput('');
        setAttachments([]);
        baseInputRef.current?.clear();
      },
      setValue: (text) => {
        setInput(text);
        baseInputRef.current?.setValue(text);
      },
    }));
    const processFiles = useCallback((files) => {
      const newAttachments = Array.from(files).map((file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const content = e.target?.result;
            if (!content) {
              resolve();
              return;
            }
            const isImage = file.type.startsWith('image/');
            const attachment = {
              id: crypto.randomUUID(),
              name: file.name,
              type: isImage ? 'image' : 'file',
              content,
              mimeType: file.type,
            };
            setAttachments((prev) => [...prev, attachment]);
            resolve();
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });
      Promise.all(newAttachments).catch((err) => {
        console.error('Failed to read attached files:', err);
      });
    }, []);
    const handleFileInput = useCallback(
      (e) => {
        if (e.target.files && e.target.files.length > 0) {
          processFiles(e.target.files);
        }
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
      [processFiles],
    );
    const handlePaste = useCallback(
      (e) => {
        if (e.clipboardData.files && e.clipboardData.files.length > 0) {
          e.preventDefault();
          processFiles(e.clipboardData.files);
        }
      },
      [processFiles],
    );
    const handleDrop = useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processFiles(e.dataTransfer.files);
        }
      },
      [processFiles],
    );
    const handleDragOver = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    }, []);
    const handleDragLeave = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    }, []);
    const removeAttachment = useCallback((id) => {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    }, []);
    const canSend = (input.trim().length > 0 || attachments.length > 0) && !isLoading && !disabled;
    return _jsxs('section', {
      'data-testid': 'chat-input-area',
      className: cn('flex flex-col gap-2', className),
      'aria-label': t('chat.inputArea', 'Chat input area'),
      onDrop: handleDrop,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      children: [
        isDragging &&
          _jsxs('div', {
            className:
              'flex items-center justify-center py-3 px-4 glass-panel border-dashed border-2 border-[var(--matrix-accent)] bg-[var(--matrix-accent)]/5 rounded-lg',
            children: [
              _jsx(Paperclip, { size: 18, className: 'text-[var(--matrix-accent)] mr-2' }),
              _jsx('span', {
                className: 'text-sm text-[var(--matrix-accent)]',
                children: t('chat.dropFilesHere', 'Drop files here'),
              }),
            ],
          }),
        _jsx(BaseChatInput, {
          ref: baseInputRef,
          value: input,
          onChange: setInput,
          onSend: handleSend,
          disabled: disabled,
          placeholder: placeholder,
          promptHistory: promptHistory,
          onPaste: handlePaste,
          topActions: _jsxs(_Fragment, {
            children: [
              _jsx(AttachmentPreview, { attachments: attachments, onRemove: removeAttachment }),
              sessionId &&
                onWorkingDirectoryChange &&
                _jsx(WorkingFolderPicker, {
                  sessionId: sessionId,
                  workingDirectory: workingDirectory ?? '',
                  onDirectoryChange: onWorkingDirectoryChange,
                }),
            ],
          }),
          leftActions: _jsxs(_Fragment, {
            children: [
              _jsx('input', {
                type: 'file',
                ref: fileInputRef,
                onChange: handleFileInput,
                multiple: true,
                accept: FILE_ACCEPT,
                className: 'hidden',
                tabIndex: -1,
              }),
              _jsx('button', {
                type: 'button',
                onClick: () => fileInputRef.current?.click(),
                disabled: disabled,
                className: cn(
                  'glass-button p-2.5 rounded-lg shrink-0 transition-colors',
                  'hover:text-[var(--matrix-accent)]',
                  disabled && 'opacity-50 cursor-not-allowed',
                ),
                title: t('chat.attachFile', 'Attach file'),
                'aria-label': t('chat.attachFile', 'Attach file'),
                children: _jsx(Paperclip, { size: 18 }),
              }),
            ],
          }),
          rightActions: _jsx(motion.button, {
            type: 'button',
            onClick: () => handleSend(input),
            disabled: !canSend,
            ...(canSend && { whileHover: { scale: 1.05 }, whileTap: { scale: 0.95 } }),
            className: cn(
              'glass-button glass-button-primary p-2.5 rounded-lg shrink-0 transition-all',
              canSend
                ? 'text-[var(--matrix-accent)] hover:shadow-[0_0_15px_var(--matrix-accent)]'
                : 'opacity-50 cursor-not-allowed',
            ),
            title: t('chat.sendMessage', 'Send message'),
            'aria-label': t('chat.sendMessage', 'Send message'),
            children: isLoading ? _jsx(Loader2, { size: 18, className: 'animate-spin' }) : _jsx(Send, { size: 18 }),
          }),
        }),
      ],
    });
  },
);
ChatInput.displayName = 'ChatInput';
