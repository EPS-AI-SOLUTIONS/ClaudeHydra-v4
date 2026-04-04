import { useCallback, useEffect, useRef, useState } from 'react';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
/**
 * Hook for CRDT-based real-time collaborative editing.
 *
 * Uses Yjs + y-websocket to sync document state via the ClaudeHydra
 * backend WebSocket server (`/ws/sync/{app}/{doc_key}`).
 *
 * Features:
 * - Conflict-free merging of concurrent edits
 * - Cursor awareness (other users' positions)
 * - Session-isolated undo/redo (Y.UndoManager)
 * - Automatic reconnection on disconnect
 */
export function useCollabDocument(options) {
  const {
    appId,
    docKey,
    userName = 'Anonymous',
    userColor = '#808080',
    isAgent = false,
    wsUrl,
    autoConnect = true,
  } = options;
  const docRef = useRef(new Y.Doc());
  const providerRef = useRef(null);
  const undoManagerRef = useRef(null);
  const [content, setContent] = useState('');
  const [peers, setPeers] = useState([]);
  const [status, setStatus] = useState('disconnected');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const doc = docRef.current;
  const text = doc.getText('content');
  // Derive WS URL from backend
  const backendWsUrl = wsUrl ?? `ws://${window.location.hostname}:8082`;
  // Initialize UndoManager
  useEffect(() => {
    const um = new Y.UndoManager(text, {
      trackedOrigins: new Set([doc.clientID]),
    });
    undoManagerRef.current = um;
    const updateStackInfo = () => {
      setCanUndo(um.undoStack.length > 0);
      setCanRedo(um.redoStack.length > 0);
    };
    um.on('stack-item-added', updateStackInfo);
    um.on('stack-item-popped', updateStackInfo);
    return () => {
      um.destroy();
    };
  }, [doc, text]);
  // Observe text changes
  useEffect(() => {
    const observer = () => {
      setContent(text.toString());
    };
    text.observe(observer);
    setContent(text.toString());
    return () => {
      text.unobserve(observer);
    };
  }, [text]);
  const connect = useCallback(() => {
    if (providerRef.current) return;
    const provider = new WebsocketProvider(`${backendWsUrl}/ws/sync/${appId}`, docKey, doc, { connect: true });
    provider.on('status', (...args) => {
      const event = args[0];
      setStatus(event.status === 'connected' ? 'connected' : 'connecting');
    });
    // Set local awareness state
    provider.awareness.setLocalStateField('user', {
      name: userName,
      color: userColor,
      isAgent,
    });
    // Observe awareness changes (other users' cursors)
    provider.awareness.on('change', () => {
      const states = provider.awareness.getStates();
      const peerList = [];
      states.forEach((state, clientId) => {
        if (clientId === doc.clientID) return;
        const user = state['user'];
        if (user) {
          const cursor = state['cursor'];
          peerList.push({
            clientId,
            userName: user.name ?? 'Unknown',
            userColor: user.color ?? '#808080',
            isAgent: user.isAgent ?? false,
            cursorAnchor: cursor?.anchor,
            cursorHead: cursor?.head,
          });
        }
      });
      setPeers(peerList);
    });
    provider.on('connection-close', () => {
      setStatus('disconnected');
    });
    providerRef.current = provider;
    setStatus('connecting');
  }, [appId, docKey, doc, userName, userColor, isAgent, backendWsUrl]);
  const disconnect = useCallback(() => {
    if (providerRef.current) {
      providerRef.current.destroy();
      providerRef.current = null;
      setStatus('disconnected');
      setPeers([]);
    }
  }, []);
  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);
  const applyChange = useCallback(
    (index, deleteCount, insertText) => {
      doc.transact(() => {
        if (deleteCount > 0) {
          text.delete(index, deleteCount);
        }
        if (insertText) {
          text.insert(index, insertText);
        }
      }, doc.clientID);
    },
    [doc, text],
  );
  const undo = useCallback(() => {
    undoManagerRef.current?.undo();
  }, []);
  const redo = useCallback(() => {
    undoManagerRef.current?.redo();
  }, []);
  return {
    doc,
    text,
    content,
    peers,
    status,
    undoManager: undoManagerRef.current ?? new Y.UndoManager(text),
    applyChange,
    connect,
    disconnect,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
