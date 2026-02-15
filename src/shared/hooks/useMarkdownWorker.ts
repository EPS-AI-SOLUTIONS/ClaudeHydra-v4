// src/shared/hooks/useMarkdownWorker.ts
/**
 * useMarkdownWorker
 * ==================
 * React hook that manages the lifecycle of the markdown Web Worker.
 *
 * Features:
 * - Spawns the worker lazily on first `parseMarkdown` call
 * - Content-hash cache (FNV-1a 32-bit) avoids re-posting identical strings
 * - Gracefully falls back to synchronous processing if the worker
 *   cannot be created (e.g. SSR, restrictive CSP)
 * - Terminates the worker on unmount to free resources
 */

import { useCallback, useEffect, useRef } from 'react';
import { fnv1a32, processMarkdownSync } from '@/shared/utils/markdownUtils';
import type { MarkdownWorkerRequest, MarkdownWorkerResponse } from '@/workers/markdownWorker';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface PendingRequest {
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
}

export function useMarkdownWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());
  const cacheRef = useRef<Map<string, string>>(new Map());
  const workerFailedRef = useRef(false);

  // ---- Initialise worker lazily ---------------------------------------
  const getWorker = useCallback((): Worker | null => {
    if (workerFailedRef.current) return null;
    if (workerRef.current) return workerRef.current;

    try {
      const w = new Worker(new URL('../workers/markdownWorker.ts', import.meta.url), {
        type: 'module',
      });

      w.addEventListener('message', (event: MessageEvent<MarkdownWorkerResponse>) => {
        const { id, result } = event.data;
        const pending = pendingRef.current.get(id);
        if (pending) {
          pending.resolve(result);
          pendingRef.current.delete(id);
        }
      });

      w.addEventListener('error', () => {
        // If the worker errors out, reject all pending and mark as failed
        workerFailedRef.current = true;
        for (const [key, pending] of pendingRef.current) {
          pending.reject(new Error('Markdown worker encountered an error'));
          pendingRef.current.delete(key);
        }
      });

      workerRef.current = w;
      return w;
    } catch {
      workerFailedRef.current = true;
      return null;
    }
  }, []);

  // ---- Parse markdown -------------------------------------------------
  const parseMarkdown = useCallback(
    (content: string): Promise<string> => {
      // Fast-path: empty content
      if (!content) return Promise.resolve('');

      // Cache lookup by content hash
      const hash = fnv1a32(content);
      const cached = cacheRef.current.get(hash);
      if (cached !== undefined) return Promise.resolve(cached);

      const worker = getWorker();

      // Fallback to synchronous processing
      if (!worker) {
        const result = processMarkdownSync(content);
        cacheRef.current.set(hash, result);
        return Promise.resolve(result);
      }

      // Delegate to the worker
      return new Promise<string>((resolve, reject) => {
        const id = hash;
        pendingRef.current.set(id, {
          resolve: (value: string) => {
            cacheRef.current.set(hash, value);
            resolve(value);
          },
          reject,
        });

        const message: MarkdownWorkerRequest = { type: 'parse', id, content };
        worker.postMessage(message);
      });
    },
    [getWorker],
  );

  // ---- Cleanup on unmount --------------------------------------------
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      // Reject any pending promises
      for (const [, pending] of pendingRef.current) {
        pending.reject(new Error('Markdown worker was terminated'));
      }
      pendingRef.current.clear();
    };
  }, []);

  return { parseMarkdown };
}
