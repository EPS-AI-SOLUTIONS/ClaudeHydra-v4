import { motion } from 'motion/react';
import { memo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
/**
 * ConnectionStatusBadge — Small inline indicator for WebSocket connection state.
 *
 * Shows a colored dot + label in the ChatHeader to give users live feedback
 * on the WebSocket connection. When the connection has given up after all
 * retry attempts, a manual "Reconnect" button is shown.
 */
import RefreshCw from '~icons/lucide/refresh-cw';
import Wifi from '~icons/lucide/wifi';
import WifiOff from '~icons/lucide/wifi-off';

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------
const STATUS_CONFIG = {
  connected: {
    color: 'text-emerald-400',
    label: 'WS Connected',
    dotClass: 'bg-emerald-400',
  },
  reconnecting: {
    color: 'text-amber-400',
    label: 'Reconnecting...',
    dotClass: 'bg-amber-400',
  },
  disconnected: {
    color: 'text-red-400',
    label: 'WS Disconnected',
    dotClass: 'bg-red-400',
  },
};
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const ConnectionStatusBadge = memo(function ConnectionStatusBadge({
  connectionStatus,
  connectionGaveUp,
  onReconnect,
}) {
  const config = STATUS_CONFIG[connectionStatus];
  // Don't show the badge when connected (clean header)
  if (connectionStatus === 'connected') {
    return _jsxs('div', {
      className: 'flex items-center gap-1.5',
      title: 'WebSocket connected',
      children: [
        _jsx('span', {
          className: `inline-block w-1.5 h-1.5 rounded-full ${config.dotClass}`,
        }),
        _jsx(Wifi, { width: 12, height: 12, className: config.color }),
      ],
    });
  }
  return _jsxs(motion.div, {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    className: `flex items-center gap-1.5 text-xs font-mono ${config.color}`,
    title: connectionGaveUp
      ? 'Connection failed — click to retry'
      : config.label,
    children: [
      connectionStatus === 'reconnecting'
        ? _jsx(motion.span, {
            className: `inline-block w-1.5 h-1.5 rounded-full ${config.dotClass}`,
            animate: { opacity: [1, 0.3, 1] },
            transition: { duration: 1.2, repeat: Infinity },
          })
        : _jsx('span', {
            className: `inline-block w-1.5 h-1.5 rounded-full ${config.dotClass}`,
          }),
      connectionStatus === 'reconnecting'
        ? _jsx(RefreshCw, { width: 12, height: 12, className: 'animate-spin' })
        : _jsx(WifiOff, { width: 12, height: 12 }),
      _jsx('span', { children: config.label }),
      connectionGaveUp &&
        _jsx('button', {
          type: 'button',
          onClick: onReconnect,
          className:
            'ml-1 px-1.5 py-0.5 rounded text-[10px] bg-red-400/20 hover:bg-red-400/30 transition-colors',
          children: 'Retry',
        }),
    ],
  });
});
ConnectionStatusBadge.displayName = 'ConnectionStatusBadge';
