/**
 * React hook for WebAssembly Edge Computing via Web Worker.
 *
 * Provides a singleton WasmClient instance shared across the app,
 * with automatic lifecycle management and ready-state tracking.
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const { maskPii, countTokens, isReady } = useWasmWorker();
 *
 *   const handleMask = async (text: string) => {
 *     const result = await maskPii(text);
 *     console.log(result.masked);
 *   };
 * }
 * ```
 */

import type { PiiResult } from '@jaskier/wasm-worker';
import { WasmClient } from '@jaskier/wasm-worker';
import { useCallback, useEffect, useRef, useState } from 'react';

// Singleton client — shared across all hook consumers
let globalClient: WasmClient | null = null;
let clientRefCount = 0;

function getOrCreateClient(): WasmClient {
  if (!globalClient) {
    globalClient = new WasmClient();
  }
  clientRefCount++;
  return globalClient;
}

function releaseClient(): void {
  clientRefCount--;
  if (clientRefCount <= 0 && globalClient) {
    globalClient.dispose();
    globalClient = null;
    clientRefCount = 0;
  }
}

export interface UseWasmWorkerResult {
  /** Whether the WASM module is loaded and ready */
  isReady: boolean;
  /** WASM module version */
  version: string;
  /** Mask all PII in text */
  maskPii: (input: string) => Promise<PiiResult>;
  /** Mask only emails */
  maskEmails: (input: string) => Promise<string>;
  /** Mask only card numbers */
  maskCards: (input: string) => Promise<string>;
  /** Mask only PESEL numbers */
  maskPesel: (input: string) => Promise<string>;
  /** Mask only phone numbers */
  maskPhones: (input: string) => Promise<string>;
  /** Mask only NIP numbers */
  maskNip: (input: string) => Promise<string>;
  /** Mask only IBAN numbers */
  maskIban: (input: string) => Promise<string>;
  /** Estimate token count */
  countTokens: (input: string) => Promise<number>;
  /** Estimate token counts for multiple texts */
  countTokensBatch: (inputs: string[]) => Promise<number[]>;
  /** Run benchmark */
  benchmark: (input: string, iterations: number) => Promise<number>;
  /** Initialization error, if any */
  error: string | null;
}

export function useWasmWorker(): UseWasmWorkerResult {
  const [isReady, setIsReady] = useState(false);
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<WasmClient | null>(null);

  useEffect(() => {
    const client = getOrCreateClient();
    clientRef.current = client;

    // If already ready (from another consumer), sync state
    if (client.initialized) {
      setIsReady(true);
      setVersion(client.wasmVersion);
    } else {
      client
        .ready()
        .then((v) => {
          setIsReady(true);
          setVersion(v);
        })
        .catch((err) => {
          setError(err.message);
        });
    }

    return () => {
      clientRef.current = null;
      releaseClient();
    };
  }, []);

  const getClient = useCallback((): WasmClient => {
    const c = clientRef.current;
    if (!c) throw new Error('WasmClient not available');
    return c;
  }, []);

  const maskPii = useCallback((input: string) => getClient().maskPii(input), [getClient]);

  const maskEmails = useCallback((input: string) => getClient().maskEmails(input), [getClient]);

  const maskCards = useCallback((input: string) => getClient().maskCards(input), [getClient]);

  const maskPesel = useCallback((input: string) => getClient().maskPesel(input), [getClient]);

  const maskPhones = useCallback((input: string) => getClient().maskPhones(input), [getClient]);

  const maskNip = useCallback((input: string) => getClient().maskNip(input), [getClient]);

  const maskIban = useCallback((input: string) => getClient().maskIban(input), [getClient]);

  const countTokens = useCallback((input: string) => getClient().countTokens(input), [getClient]);

  const countTokensBatch = useCallback((inputs: string[]) => getClient().countTokensBatch(inputs), [getClient]);

  const benchmark = useCallback(
    (input: string, iterations: number) => getClient().benchmark(input, iterations),
    [getClient],
  );

  return {
    isReady,
    version,
    maskPii,
    maskEmails,
    maskCards,
    maskPesel,
    maskPhones,
    maskNip,
    maskIban,
    countTokens,
    countTokensBatch,
    benchmark,
    error,
  };
}
