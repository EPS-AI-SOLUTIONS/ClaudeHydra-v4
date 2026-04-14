/**
 * SearchOverlay — In-chat Ctrl+F search with match highlighting and navigation.
 *
 * #19 Message search
 */
import { cn } from '@jaskier/ui';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import ChevronDown from '~icons/lucide/chevron-down';
import ChevronUp from '~icons/lucide/chevron-up';
import Search from '~icons/lucide/search';
import X from '~icons/lucide/x';
export function SearchOverlay({ messages, onMatchChange, onClose }) {
  const [query, setQuery] = useState('');
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const inputRef = useRef(null);
  // Debounce query for match computation (300ms)
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef(undefined);
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);
  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  // Find all matches (uses debounced query)
  const matches = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    const q = debouncedQuery.toLowerCase();
    const result = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg) continue;
      if (msg.content.toLowerCase().includes(q)) {
        result.push({ messageId: msg.id, messageIndex: i });
      }
    }
    return result;
  }, [debouncedQuery, messages]);
  // Notify parent of current match
  useEffect(() => {
    if (matches.length > 0 && currentMatchIdx < matches.length) {
      onMatchChange?.(
        matches[currentMatchIdx]?.messageId ?? null,
        currentMatchIdx,
      );
    } else {
      onMatchChange?.(null, 0);
    }
  }, [matches, currentMatchIdx, onMatchChange]);
  // Reset index when debounced query changes
  useEffect(() => {
    setCurrentMatchIdx(0);
  }, []);
  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIdx((prev) => (prev + 1) % matches.length);
  }, [matches.length]);
  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIdx((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        if (e.shiftKey) {
          goPrev();
        } else {
          goNext();
        }
      }
    },
    [onClose, goNext, goPrev],
  );
  return _jsxs(motion.div, {
    initial: { opacity: 0, y: -10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.15 },
    className:
      'absolute top-2 right-2 z-30 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--matrix-bg-secondary)]/95 border border-[var(--matrix-border)] backdrop-blur-md shadow-lg',
    children: [
      _jsx(Search, {
        width: 14,
        height: 14,
        className: 'text-[var(--matrix-text-secondary)] shrink-0',
      }),
      _jsx('input', {
        ref: inputRef,
        type: 'text',
        value: query,
        onChange: (e) => setQuery(e.target.value),
        onKeyDown: handleKeyDown,
        placeholder: 'Search messages...',
        'aria-label': 'Search messages',
        className:
          'w-48 bg-transparent text-sm text-[var(--matrix-text-primary)] placeholder:text-[var(--matrix-text-secondary)]/50 outline-none font-mono',
      }),
      query &&
        _jsx('span', {
          className:
            'text-xs text-[var(--matrix-text-secondary)] font-mono whitespace-nowrap',
          children:
            matches.length > 0
              ? `${currentMatchIdx + 1}/${matches.length}`
              : '0/0',
        }),
      _jsxs('div', {
        className: 'flex items-center gap-0.5',
        children: [
          _jsx('button', {
            type: 'button',
            onClick: goPrev,
            disabled: matches.length === 0,
            className: cn(
              'p-1 rounded transition-colors',
              matches.length > 0
                ? 'hover:bg-[var(--matrix-accent)]/10 text-[var(--matrix-text-secondary)]'
                : 'opacity-30 cursor-not-allowed text-[var(--matrix-text-secondary)]',
            ),
            'aria-label': 'Previous match',
            children: _jsx(ChevronUp, { width: 14, height: 14 }),
          }),
          _jsx('button', {
            type: 'button',
            onClick: goNext,
            disabled: matches.length === 0,
            className: cn(
              'p-1 rounded transition-colors',
              matches.length > 0
                ? 'hover:bg-[var(--matrix-accent)]/10 text-[var(--matrix-text-secondary)]'
                : 'opacity-30 cursor-not-allowed text-[var(--matrix-text-secondary)]',
            ),
            'aria-label': 'Next match',
            children: _jsx(ChevronDown, { width: 14, height: 14 }),
          }),
        ],
      }),
      _jsx('button', {
        type: 'button',
        onClick: onClose,
        className:
          'p-1 rounded hover:bg-[var(--matrix-accent)]/10 text-[var(--matrix-text-secondary)] transition-colors',
        'aria-label': 'Close search',
        children: _jsx(X, { width: 14, height: 14 }),
      }),
    ],
  });
}
/**
 * Utility: highlight search matches in text.
 * Returns an array of React nodes with <mark> wrapping matches.
 */
export function highlightText(text, query) {
  if (!query.trim()) return text;
  const parts = text.split(
    new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
  );
  return parts.map((part, i) => {
    if (part.toLowerCase() === query.toLowerCase()) {
      return _jsx(
        'mark',
        {
          className: 'bg-yellow-400/40 text-inherit rounded px-0.5',
          children: part,
        },
        `match-${i.toString()}-${part}`,
      );
    }
    return part;
  });
}
