/**
 * useAutoScroll — Tracks whether the user has scrolled up from the bottom.
 * Shows a "new messages" indicator and provides a scrollToBottom helper.
 *
 * #20 Auto-scroll indicator
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAutoScrollResult {
  /** Ref to attach to the scrollable container */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Ref to attach to an element at the bottom of messages */
  bottomRef: React.RefObject<HTMLDivElement | null>;
  /** True when user has scrolled away from bottom and new messages arrived */
  showNewMessages: boolean;
  /** Scroll to the bottom smoothly */
  scrollToBottom: () => void;
}

const SCROLL_THRESHOLD = 100; // px from bottom to consider "at bottom"

export function useAutoScroll(messageCount: number): UseAutoScrollResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMessages, setShowNewMessages] = useState(false);
  const prevCountRef = useRef(messageCount);

  // Check scroll position
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setShowNewMessages(false);
    }
  }, []);

  // Attach scroll listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // When new messages arrive and user is not at bottom, show indicator
  useEffect(() => {
    if (messageCount > prevCountRef.current && !isAtBottom) {
      setShowNewMessages(true);
    }
    // Auto-scroll if user is at bottom
    if (isAtBottom && messageCount > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevCountRef.current = messageCount;
  }, [messageCount, isAtBottom]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowNewMessages(false);
  }, []);

  return {
    containerRef,
    bottomRef,
    showNewMessages,
    scrollToBottom,
  };
}
