import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
/**
 * Renders cursor indicators for connected collaboration peers.
 *
 * Shows each peer's name, color, and agent badge in a compact list.
 * Used as an overlay on the collaborative editor.
 */
export function CollabCursors({ peers }) {
  if (peers.length === 0) return null;
  return _jsx('div', {
    className: 'flex flex-wrap gap-2 p-2 text-xs',
    children: peers.map((peer) =>
      _jsxs(
        'div',
        {
          className: 'flex items-center gap-1 rounded-full px-2 py-0.5',
          style: {
            backgroundColor: `${peer.userColor}20`,
            borderLeft: `3px solid ${peer.userColor}`,
          },
          children: [
            _jsx('div', {
              className: 'h-2 w-2 rounded-full',
              style: { backgroundColor: peer.userColor },
            }),
            _jsx('span', { className: 'opacity-80', children: peer.userName }),
            peer.isAgent &&
              _jsx('span', {
                className:
                  'rounded bg-blue-500/20 px-1 text-blue-400 text-[10px]',
                children: 'AI',
              }),
          ],
        },
        peer.clientId,
      ),
    ),
  });
}
