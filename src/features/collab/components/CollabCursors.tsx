import type { CollabPeer } from '../hooks/useCollabDocument';

interface CollabCursorsProps {
  peers: CollabPeer[];
}

/**
 * Renders cursor indicators for connected collaboration peers.
 *
 * Shows each peer's name, color, and agent badge in a compact list.
 * Used as an overlay on the collaborative editor.
 */
export function CollabCursors({ peers }: CollabCursorsProps) {
  if (peers.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-2 text-xs">
      {peers.map((peer) => (
        <div
          key={peer.clientId}
          className="flex items-center gap-1 rounded-full px-2 py-0.5"
          style={{
            backgroundColor: `${peer.userColor}20`,
            borderLeft: `3px solid ${peer.userColor}`,
          }}
        >
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: peer.userColor }} />
          <span className="opacity-80">{peer.userName}</span>
          {peer.isAgent && <span className="rounded bg-blue-500/20 px-1 text-blue-400 text-[10px]">AI</span>}
        </div>
      ))}
    </div>
  );
}
