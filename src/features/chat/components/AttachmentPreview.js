import { motion } from 'motion/react';
import { memo, useCallback } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
/**
 * AttachmentPreview â€” Displays file/image attachment chips with remove button.
 *
 * Extracted from ChatInput.tsx for reusability and cleaner component boundaries.
 */
import FileText from '~icons/lucide/file-text';
import X from '~icons/lucide/x';

// ---------------------------------------------------------------------------
// Single chip
// ---------------------------------------------------------------------------
const AttachmentChip = memo(function AttachmentChip({ attachment, onRemove }) {
  const handleRemove = useCallback(
    () => onRemove(attachment.id),
    [onRemove, attachment.id],
  );
  return _jsxs(motion.div, {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
    className:
      'flex items-center gap-2 px-3 py-2 bg-[var(--matrix-bg-secondary)] border border-[var(--matrix-accent)]/30 rounded-lg',
    children: [
      attachment.type === 'image'
        ? _jsx('div', {
            className: 'w-8 h-8 rounded overflow-hidden shrink-0',
            children: _jsx('img', {
              src: attachment.content,
              alt: attachment.name,
              className: 'w-full h-full object-cover',
            }),
          })
        : _jsx(FileText, {
            width: 16,
            height: 16,
            className: 'text-blue-400 shrink-0',
          }),
      _jsx('span', {
        className:
          'text-sm truncate max-w-[150px] text-[var(--matrix-text-primary)]',
        children: attachment.name,
      }),
      _jsx('button', {
        type: 'button',
        onClick: handleRemove,
        className:
          'text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-error)] transition-colors',
        'aria-label': `Remove ${attachment.name}`,
        children: _jsx(X, { width: 14, height: 14 }),
      }),
    ],
  });
});
AttachmentChip.displayName = 'AttachmentChip';
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const AttachmentPreview = memo(function AttachmentPreview({
  attachments,
  onRemove,
}) {
  if (attachments.length === 0) return null;
  return _jsx('div', {
    className: 'flex flex-wrap gap-2',
    children: attachments.map((att) =>
      _jsx(AttachmentChip, { attachment: att, onRemove: onRemove }, att.id),
    ),
  });
});
AttachmentPreview.displayName = 'AttachmentPreview';
