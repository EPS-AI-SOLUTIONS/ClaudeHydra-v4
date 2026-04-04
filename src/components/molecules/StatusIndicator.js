// src/components/molecules/StatusIndicator.tsx
/**
 * StatusIndicator Molecule
 * ========================
 * Animated dot with optional label text.
 * States: online (green), offline (red/gray), pending (yellow), error (red).
 * Size variants: sm, md.
 *
 * ClaudeHydra: Uses CSS variable-based colors (matching GeminiHydra pattern).
 */
import { cn } from '@jaskier/ui';
import { motion } from 'motion/react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';

// ---------------------------------------------------------------------------
// Status color mapping (CSS variable-based)
// ---------------------------------------------------------------------------
const dotColorMap = {
  online: 'bg-[var(--matrix-success)]',
  offline: 'bg-gray-500',
  pending: 'bg-[var(--matrix-warning)]',
  error: 'bg-[var(--matrix-error)]',
};
const glowMap = {
  online: 'shadow-[0_0_6px_var(--matrix-success)]',
  offline: '',
  pending: 'shadow-[0_0_6px_var(--matrix-warning)]',
  error: 'shadow-[0_0_6px_var(--matrix-error)]',
};
const textColorMap = {
  online: 'text-[var(--matrix-success)]',
  offline: 'text-matrix-text-dim',
  pending: 'text-[var(--matrix-warning)]',
  error: 'text-[var(--matrix-error)]',
};
const sizeMap = {
  sm: { dot: 'h-1.5 w-1.5', text: 'text-xs' },
  md: { dot: 'h-2 w-2', text: 'text-sm' },
};
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function StatusIndicator({ status = 'offline', size = 'md', label, pulse, className, ...props }) {
  const shouldPulse = pulse ?? (status === 'online' || status === 'pending');
  const { dot: dotSize, text: textSize } = sizeMap[size];
  return _jsxs('div', {
    className: cn('inline-flex items-center gap-2', className),
    role: 'status',
    'aria-label': label ?? status,
    ...props,
    children: [
      _jsxs('span', {
        className: 'relative flex items-center justify-center',
        children: [
          _jsx('span', { className: cn('rounded-full shrink-0', dotSize, dotColorMap[status], glowMap[status]) }),
          shouldPulse &&
            _jsx(motion.span, {
              className: cn('absolute rounded-full opacity-75', dotSize, dotColorMap[status]),
              animate: {
                scale: [1, 2.5],
                opacity: [0.75, 0],
              },
              transition: {
                duration: 1.5,
                repeat: Number.POSITIVE_INFINITY,
                ease: 'easeOut',
              },
            }),
        ],
      }),
      label != null &&
        _jsx('span', { className: cn('font-mono leading-none', textSize, textColorMap[status]), children: label }),
    ],
  });
}
