/**
 * CompletionFeedback — Wrapper that applies the completion flash animation.
 *
 * When `flashActive` is true, adds the `completion-flash` CSS class to trigger
 * a brief visual pulse on task completion. The actual sound playback and toast
 * notifications are handled by the `useCompletionFeedback` hook in @jaskier/core.
 *
 * Extracted from ClaudeChatView.tsx for clarity.
 */
import { cn } from '@jaskier/ui';
import { memo } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const CompletionFeedback = memo(
  ({ flashActive, className, children }) => {
    return _jsx('div', {
      'data-testid': 'chat-view',
      className: cn(className, flashActive && 'completion-flash rounded-xl'),
      children: children,
    });
  },
);
CompletionFeedback.displayName = 'CompletionFeedback';
