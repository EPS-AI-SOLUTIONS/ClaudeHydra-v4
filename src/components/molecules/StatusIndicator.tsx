// src/components/molecules/StatusIndicator.tsx
/**
 * StatusIndicator Molecule
 * ========================
 * Animated dot with optional label text.
 * States: online (green), offline (red/gray), pending (yellow), error (red).
 * Size variants: sm, md.
 *
 * ClaudeHydra-v4: Uses .status-dot CSS classes from globals.css (green Matrix theme).
 */

import { motion } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StatusState = 'online' | 'offline' | 'pending' | 'error';
export type StatusSize = 'sm' | 'md';

export interface StatusIndicatorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Current status state. */
  status?: StatusState;
  /** Size variant. */
  size?: StatusSize;
  /** Optional label text displayed next to the dot. */
  label?: string;
  /** Whether the dot should pulse. Defaults to `true` for online/pending. */
  pulse?: boolean;
}

// ---------------------------------------------------------------------------
// Status color mapping
// Uses globals.css .status-dot-* classes for online/offline/pending.
// Falls back to Tailwind for error (no .status-dot-error in globals).
// ---------------------------------------------------------------------------

const dotCssClassMap: Record<StatusState, string> = {
  online: 'status-dot-online',
  offline: 'status-dot-offline',
  pending: 'status-dot-pending',
  error: 'bg-[var(--matrix-error)] shadow-[0_0_10px_var(--matrix-error)]',
};

const textColorMap: Record<StatusState, string> = {
  online: 'text-[var(--matrix-success)]',
  offline: 'text-[var(--matrix-error)]',
  pending: 'text-[var(--matrix-warning)]',
  error: 'text-[var(--matrix-error)]',
};

const sizeMap: Record<StatusSize, { dot: string; text: string }> = {
  sm: { dot: 'h-1.5 w-1.5', text: 'text-xs' },
  md: { dot: 'h-2 w-2', text: 'text-sm' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusIndicator({
  status = 'offline',
  size = 'md',
  label,
  pulse,
  className,
  ...props
}: StatusIndicatorProps) {
  const shouldPulse = pulse ?? (status === 'online' || status === 'pending');

  const { dot: dotSize, text: textSize } = sizeMap[size];

  return (
    <div
      className={cn('inline-flex items-center gap-2', className)}
      role="status"
      aria-label={label ?? status}
      {...props}
    >
      {/* Dot wrapper */}
      <span className="relative flex items-center justify-center">
        {/* Solid dot — uses globals.css .status-dot-* */}
        <span className={cn('rounded-full flex-shrink-0', dotSize, dotCssClassMap[status])} />

        {/* Pulse ring */}
        {shouldPulse && (
          <motion.span
            className={cn('absolute rounded-full opacity-75', dotSize, dotCssClassMap[status])}
            animate={{
              scale: [1, 2.5],
              opacity: [0.75, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'easeOut',
            }}
          />
        )}
      </span>

      {/* Label */}
      {label != null && <span className={cn('font-mono leading-none', textSize, textColorMap[status])}>{label}</span>}
    </div>
  );
}
