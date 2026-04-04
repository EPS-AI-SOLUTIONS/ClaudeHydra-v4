/**
 * VirtualMessageList — Virtualized message rendering with @tanstack/react-virtual.
 * Use this for very long conversations (100+ messages) where DOM node count matters.
 *
 * #34 Virtual scroll for long message lists
 */
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';
import { MessageBubble } from './MessageBubble';
export function VirtualMessageList({ messages, highlightId }) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120, // estimated row height
    overscan: 5,
  });
  return _jsx('div', {
    ref: parentRef,
    className: 'flex-1 overflow-y-auto scrollbar-thin',
    role: 'log',
    'aria-live': 'polite',
    children: _jsx('div', {
      style: {
        height: `${virtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      },
      children: virtualizer.getVirtualItems().map((virtualRow) => {
        const msg = messages[virtualRow.index];
        if (!msg) return null;
        return _jsx(
          'div',
          {
            'data-message-id': msg.id,
            ref: virtualizer.measureElement,
            'data-index': virtualRow.index,
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            },
            className: `py-2 ${highlightId === msg.id ? 'ring-2 ring-yellow-400/60 rounded-xl' : ''}`,
            children: _jsx(MessageBubble, {
              message: msg,
              isLast: virtualRow.index === messages.length - 1,
              isStreaming: !!msg.streaming,
            }),
          },
          msg.id,
        );
      }),
    }),
  });
}
