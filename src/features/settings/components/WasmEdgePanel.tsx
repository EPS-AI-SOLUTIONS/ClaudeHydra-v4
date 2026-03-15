/**
 * WASM Edge Computing dashboard panel.
 *
 * Shows: module status, version, cache info, PII masking benchmark,
 * token counter demo, and CPU offload metrics.
 */

import { clearWasmCache, getWasmCacheInfo } from '@jaskier/wasm-worker';
import { useState } from 'react';
import { useWasmWorker } from '@/shared/hooks/useWasmWorker';

export function WasmEdgePanel() {
  const { isReady, version, maskPii, countTokens, benchmark, error } = useWasmWorker();
  const [testInput, setTestInput] = useState(
    'Email: jan.kowalski@firma.pl, PESEL: 44051401359, Tel: +48 123 456 789, Karta: 4111 1111 1111 1111',
  );
  const [maskResult, setMaskResult] = useState<string | null>(null);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [benchResult, setBenchResult] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleMask = async () => {
    if (!isReady) return;
    setIsRunning(true);
    try {
      const result = await maskPii(testInput);
      setMaskResult(JSON.stringify(result, null, 2));
    } catch (err) {
      setMaskResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCountTokens = async () => {
    if (!isReady) return;
    const count = await countTokens(testInput);
    setTokenCount(count);
  };

  const handleBenchmark = async () => {
    if (!isReady) return;
    setIsRunning(true);
    try {
      // Generate 50k char string
      const largeInput = testInput.repeat(Math.ceil(50_000 / testInput.length)).slice(0, 50_000);
      const ms = await benchmark(largeInput, 100);
      const perOp = (ms / 100).toFixed(2);
      const charsPerSec = Math.round((50_000 * 100) / (ms / 1000));
      setBenchResult(
        `100 iterations on 50k chars: ${ms.toFixed(0)}ms total, ${perOp}ms/op, ${charsPerSec.toLocaleString()} chars/sec`,
      );
    } catch (err) {
      setBenchResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCacheInfo = async () => {
    const info = await getWasmCacheInfo();
    setCacheInfo(
      info.exists ? `${info.entries} file(s), ${(info.estimatedBytes / 1024).toFixed(1)} KB` : 'No WASM cache found',
    );
  };

  const handleClearCache = async () => {
    await clearWasmCache();
    setCacheInfo('Cache cleared');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold">WASM Edge Computing</h3>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isReady
              ? 'bg-emerald-500/20 text-emerald-400'
              : error
                ? 'bg-red-500/20 text-red-400'
                : 'bg-yellow-500/20 text-yellow-400'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isReady ? 'bg-emerald-400' : error ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'
            }`}
          />
          {isReady ? `v${version}` : error ? 'Error' : 'Loading...'}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
      )}

      {/* Test Input */}
      <div className="space-y-2">
        <label className="text-sm text-neutral-400">Test Input (PII data)</label>
        <textarea
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 p-3 text-sm text-neutral-200 font-mono resize-y min-h-[80px]"
          rows={3}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleMask}
          disabled={!isReady || isRunning}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Mask PII
        </button>
        <button
          type="button"
          onClick={handleCountTokens}
          disabled={!isReady}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Count Tokens
        </button>
        <button
          type="button"
          onClick={handleBenchmark}
          disabled={!isReady || isRunning}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Benchmark (50k chars)
        </button>
        <button
          type="button"
          onClick={handleCacheInfo}
          className="rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600 transition-colors"
        >
          Cache Info
        </button>
        <button
          type="button"
          onClick={handleClearCache}
          className="rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600 transition-colors"
        >
          Clear Cache
        </button>
      </div>

      {/* Token Count */}
      {tokenCount !== null && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
          <span className="text-sm text-blue-300">
            Estimated tokens: <span className="font-mono font-bold">{tokenCount}</span>
          </span>
        </div>
      )}

      {/* Benchmark Result */}
      {benchResult && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <span className="text-sm text-amber-300 font-mono">{benchResult}</span>
        </div>
      )}

      {/* Cache Info */}
      {cacheInfo && (
        <div className="rounded-lg border border-neutral-600 bg-neutral-800 p-3">
          <span className="text-sm text-neutral-300">
            WASM Cache: <span className="font-mono">{cacheInfo}</span>
          </span>
        </div>
      )}

      {/* Mask Result */}
      {maskResult && (
        <div className="space-y-1">
          <label className="text-sm text-neutral-400">PII Masking Result</label>
          <pre className="rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-xs text-neutral-200 overflow-auto max-h-[300px] font-mono">
            {maskResult}
          </pre>
        </div>
      )}

      {/* Architecture Info */}
      <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 space-y-1">
        <p className="text-xs text-neutral-500">
          PII masking and token counting run in a dedicated Web Worker via WebAssembly. The main UI thread is never
          blocked — maintaining 60 FPS during processing.
        </p>
        <p className="text-xs text-neutral-500">
          WASM binaries are cached via Service Worker Cache API for instant 0ms loading on revisits.
        </p>
      </div>
    </div>
  );
}
