/**
 * React hook for WebAssembly Edge Computing via Web Worker.
 *
 * Provides a singleton WasmClient instance shared across the app,
 * with automatic lifecycle management and ready-state tracking.
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const { maskPii, countTokens, cosineSimilarity, analyzeText, isReady } = useWasmWorker();
 *
 *   const handleMask = async (text: string) => {
 *     const result = await maskPii(text);
 *     console.log(result.masked);
 *   };
 *
 *   const handleSimilarity = async () => {
 *     const score = await cosineSimilarity("query A", "query B");
 *     console.log(`Similarity: ${(score * 100).toFixed(1)}%`);
 *   };
 * }
 * ```
 */
import { WasmClient } from '@jaskier/wasm-worker';
import { useCallback, useEffect, useRef, useState } from 'react';

// Singleton client — shared across all hook consumers
let globalClient = null;
let clientRefCount = 0;
function getOrCreateClient() {
  if (!globalClient) {
    globalClient = new WasmClient();
  }
  clientRefCount++;
  return globalClient;
}
function releaseClient() {
  clientRefCount--;
  if (clientRefCount <= 0 && globalClient) {
    globalClient.dispose();
    globalClient = null;
    clientRefCount = 0;
  }
}
export function useWasmWorker() {
  const [isReady, setIsReady] = useState(false);
  const [version, setVersion] = useState('');
  const [error, setError] = useState(null);
  const clientRef = useRef(null);
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
  const getClient = useCallback(() => {
    const c = clientRef.current;
    if (!c) throw new Error('WasmClient not available');
    return c;
  }, []);
  // ── PII ──
  const maskPii = useCallback(
    (input) => getClient().maskPii(input),
    [getClient],
  );
  const maskEmails = useCallback(
    (input) => getClient().maskEmails(input),
    [getClient],
  );
  const maskCards = useCallback(
    (input) => getClient().maskCards(input),
    [getClient],
  );
  const maskPesel = useCallback(
    (input) => getClient().maskPesel(input),
    [getClient],
  );
  const maskPhones = useCallback(
    (input) => getClient().maskPhones(input),
    [getClient],
  );
  const maskNip = useCallback(
    (input) => getClient().maskNip(input),
    [getClient],
  );
  const maskIban = useCallback(
    (input) => getClient().maskIban(input),
    [getClient],
  );
  // ── Tokens ──
  const countTokens = useCallback(
    (input) => getClient().countTokens(input),
    [getClient],
  );
  const countTokensBatch = useCallback(
    (inputs) => getClient().countTokensBatch(inputs),
    [getClient],
  );
  // ── Similarity ──
  const cosineSimilarity = useCallback(
    (a, b) => getClient().cosineSimilarity(a, b),
    [getClient],
  );
  const cosineSimilarityNgram = useCallback(
    (a, b, n) => getClient().cosineSimilarityNgram(a, b, n),
    [getClient],
  );
  const levenshteinDistance = useCallback(
    (a, b) => getClient().levenshteinDistance(a, b),
    [getClient],
  );
  const levenshteinSimilarity = useCallback(
    (a, b) => getClient().levenshteinSimilarity(a, b),
    [getClient],
  );
  const jaccardSimilarity = useCallback(
    (a, b) => getClient().jaccardSimilarity(a, b),
    [getClient],
  );
  const fuzzySearch = useCallback(
    (query, candidates, minScore = 0.3) =>
      getClient().fuzzySearch(query, candidates, minScore),
    [getClient],
  );
  const batchSimilarity = useCallback(
    (query, candidates) => getClient().batchSimilarity(query, candidates),
    [getClient],
  );
  // ── Text Analysis ──
  const analyzeText = useCallback(
    (input) => getClient().analyzeText(input),
    [getClient],
  );
  const wordFrequency = useCallback(
    (input, topN = 10) => getClient().wordFrequency(input, topN),
    [getClient],
  );
  const hashText = useCallback(
    (input) => getClient().hashText(input),
    [getClient],
  );
  const smartTruncate = useCallback(
    (input, maxChars) => getClient().smartTruncate(input, maxChars),
    [getClient],
  );
  const extractKeywords = useCallback(
    (input, minWordLength = 3) =>
      getClient().extractKeywords(input, minWordLength),
    [getClient],
  );
  // ── Benchmarks ──
  const benchmark = useCallback(
    (input, iterations) => getClient().benchmark(input, iterations),
    [getClient],
  );
  const benchmarkSimilarity = useCallback(
    (a, b, iterations) => getClient().benchmarkSimilarity(a, b, iterations),
    [getClient],
  );
  return {
    isReady,
    version,
    error,
    // PII
    maskPii,
    maskEmails,
    maskCards,
    maskPesel,
    maskPhones,
    maskNip,
    maskIban,
    // Tokens
    countTokens,
    countTokensBatch,
    // Similarity
    cosineSimilarity,
    cosineSimilarityNgram,
    levenshteinDistance,
    levenshteinSimilarity,
    jaccardSimilarity,
    fuzzySearch,
    batchSimilarity,
    // Text Analysis
    analyzeText,
    wordFrequency,
    hashText,
    smartTruncate,
    extractKeywords,
    // Benchmarks
    benchmark,
    benchmarkSimilarity,
  };
}
