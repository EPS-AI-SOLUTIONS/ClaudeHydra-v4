// src/features/chat/components/ImagePreview.tsx
/**
 * ImagePreview — Animated image thumbnail with remove button
 * ===========================================================
 * Extracted from ChatInput.tsx for reusability.
 * Shows a small preview of an attached image with a hover-to-reveal close button.
 */
import { cn } from '@jaskier/ui';
import { motion } from 'motion/react';
import { memo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import X from '~icons/lucide/x';

const ImagePreview = memo(({ src, onClear }) =>
  _jsxs(motion.div, {
    layout: true,
    initial: { opacity: 0, scale: 0.8, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.8, y: 10 },
    className: 'relative inline-block w-fit mb-3 group',
    children: [
      _jsx('img', {
        src: src,
        alt: 'Preview',
        className: cn(
          'h-24 w-auto rounded-xl border shadow-lg',
          'border-[var(--matrix-accent)]/50',
          'shadow-[0_0_15px_rgba(255,255,255,0.1)]',
        ),
      }),
      _jsx('button', {
        type: 'button',
        onClick: onClear,
        className: cn(
          'absolute -top-2 -right-2 p-1 rounded-full',
          'bg-red-500 text-white',
          'opacity-0 group-hover:opacity-100',
          'transition-all shadow-sm hover:scale-110',
        ),
        children: _jsx(X, { width: 14, height: 14, strokeWidth: 3 }),
      }),
    ],
  }),
);
ImagePreview.displayName = 'ImagePreview';
export default ImagePreview;
