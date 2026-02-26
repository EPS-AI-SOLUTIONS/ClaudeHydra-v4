/**
 * useOnlineStatus — Detects browser online/offline state.
 * Returns true when navigator.onLine, false when offline.
 * Updates reactively via 'online' / 'offline' window events.
 *
 * #25 Offline detection
 */

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  return true; // SSR: assume online
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
