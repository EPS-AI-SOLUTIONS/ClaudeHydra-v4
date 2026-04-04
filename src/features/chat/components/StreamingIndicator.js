/**
 * StreamingIndicator — Animated progress bar shown during streaming.
 *
 * Displays a horizontal gradient bar that scales in from the left to indicate
 * an active streaming response. Extracted from ClaudeChatView.tsx.
 */
import { motion } from 'motion/react';
import { memo } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const StreamingIndicator = memo(({ isStreaming }) => {
  if (!isStreaming) return null;
  return _jsx(motion.div, {
    'data-testid': 'chat-streaming-bar',
    initial: { scaleX: 0 },
    animate: { scaleX: 1 },
    className:
      'h-0.5 bg-linear-to-r from-transparent via-[var(--matrix-accent)] to-transparent origin-left mt-1 rounded-full',
  });
});
StreamingIndicator.displayName = 'StreamingIndicator';
