import { Loader2, Wifi, WifiOff } from 'lucide-react';

interface CollabStatusBadgeProps {
  status: 'connecting' | 'connected' | 'disconnected';
  peerCount: number;
}

/**
 * Compact status badge showing collaboration connection state.
 *
 * Shows:
 * - Green dot + peer count when connected
 * - Spinning loader when connecting
 * - Red dot when disconnected
 */
export function CollabStatusBadge({
  status,
  peerCount,
}: CollabStatusBadgeProps) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {status === 'connected' && (
        <>
          <Wifi className="h-3 w-3 text-emerald-400" />
          <span className="text-emerald-400">
            {peerCount} {peerCount === 1 ? 'peer' : 'peers'}
          </span>
        </>
      )}
      {status === 'connecting' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
          <span className="text-amber-400">Connecting...</span>
        </>
      )}
      {status === 'disconnected' && (
        <>
          <WifiOff className="h-3 w-3 text-red-400" />
          <span className="text-red-400">Offline</span>
        </>
      )}
    </div>
  );
}
