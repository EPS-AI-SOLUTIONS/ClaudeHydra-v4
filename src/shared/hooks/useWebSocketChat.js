/**
 * ClaudeHydra — WebSocket Chat Hook.
 * Thin wrapper around @jaskier/chat-module useWebSocketChat with CH-specific
 * WS URL construction and Zod message validation.
 */
import { useWebSocketChat as useSharedWebSocketChat } from '@jaskier/chat-module';
import { useCallback, useMemo } from 'react';
import { wsServerMessageSchema } from '@/shared/api/schemas';
import { env } from '@/shared/config/env';
import { dispatchViewHint } from '@/shared/hooks/usePredictivePrefetch';

// Re-export shared constants and types for backward compatibility
export { MAX_RECONNECT_ATTEMPTS } from '@jaskier/chat-module';

// ============================================================================
// WS URL CONSTRUCTION
// ============================================================================
function getWsUrl() {
  const backendUrl = env.VITE_BACKEND_URL;
  const authSecret = env.VITE_AUTH_SECRET;
  const tokenParam = authSecret ? `?token=${encodeURIComponent(authSecret)}` : '';
  if (backendUrl) {
    return `${backendUrl.replace(/^http/, 'ws')}/ws/chat${tokenParam}`;
  }
  const loc = window.location;
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${loc.host}/ws/chat${tokenParam}`;
}
// ============================================================================
// MESSAGE PARSER (Zod validation)
// ============================================================================
function parseServerMessage(raw) {
  const parsed = wsServerMessageSchema.safeParse(raw);
  if (!parsed.success) return null;
  const msg = parsed.data;
  // Predictive UI pre-fetching: dispatch view hints to prefetch hook
  if (msg.type === 'view_hint' && 'views' in msg) {
    dispatchViewHint(msg.views);
  }
  return msg;
}
// ============================================================================
// HOOK
// ============================================================================
export function useWebSocketChat(callbacks) {
  // Adapt CH callbacks to shared callback format
  const sharedCallbacks = useMemo(
    () => ({
      onStart: (msg, sid) => {
        callbacks.onStart?.(msg, sid);
      },
      onToken: callbacks.onToken,
      onToolCall: (msg, sid) => {
        callbacks.onToolCall?.(msg, sid);
      },
      onToolResult: (msg, sid) => {
        callbacks.onToolResult?.(msg, sid);
      },
      onComplete: (msg, sid) => {
        callbacks.onComplete?.(msg, sid);
      },
      onError: callbacks.onError,
      onFallback: (msg, sid) => {
        callbacks.onFallback?.(msg, sid);
      },
    }),
    [callbacks],
  );
  const result = useSharedWebSocketChat(sharedCallbacks, {
    getWsUrl,
    parseServerMessage,
  });
  // Adapt sendExecute signature: shared uses (prompt, mode, model, session_id)
  // CH uses (prompt, model, toolsEnabled, sessionId)
  const sendExecute = useCallback(
    (prompt, model, toolsEnabled, sessionId) => {
      // Map CH's toolsEnabled to a mode string for the shared hook
      const mode = toolsEnabled !== false ? 'tools' : 'chat';
      result.sendExecute(prompt, mode, model, sessionId);
    },
    [result],
  );
  // Derive a simplified connection status for UI display
  const connectionStatus =
    result.status === 'connected' ? 'connected' : result.status === 'reconnecting' ? 'reconnecting' : 'disconnected';
  return {
    status: result.status,
    connectionStatus,
    isStreaming: result.isStreaming,
    streamingSessionId: result.streamingSessionId,
    connectionGaveUp: result.connectionGaveUp,
    sendExecute,
    cancelStream: result.cancelStream,
    manualReconnect: result.manualReconnect,
  };
}
