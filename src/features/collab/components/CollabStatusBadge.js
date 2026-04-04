import { Loader2, Wifi, WifiOff } from 'lucide-react';
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
/**
 * Compact status badge showing collaboration connection state.
 *
 * Shows:
 * - Green dot + peer count when connected
 * - Spinning loader when connecting
 * - Red dot when disconnected
 */
export function CollabStatusBadge({ status, peerCount }) {
  return _jsxs('div', {
    className: 'flex items-center gap-1.5 text-xs',
    children: [
      status === 'connected' &&
        _jsxs(_Fragment, {
          children: [
            _jsx(Wifi, { className: 'h-3 w-3 text-emerald-400' }),
            _jsxs('span', {
              className: 'text-emerald-400',
              children: [peerCount, ' ', peerCount === 1 ? 'peer' : 'peers'],
            }),
          ],
        }),
      status === 'connecting' &&
        _jsxs(_Fragment, {
          children: [
            _jsx(Loader2, { className: 'h-3 w-3 animate-spin text-amber-400' }),
            _jsx('span', { className: 'text-amber-400', children: 'Connecting...' }),
          ],
        }),
      status === 'disconnected' &&
        _jsxs(_Fragment, {
          children: [
            _jsx(WifiOff, { className: 'h-3 w-3 text-red-400' }),
            _jsx('span', { className: 'text-red-400', children: 'Offline' }),
          ],
        }),
    ],
  });
}
