import { clearWasmCache, getWasmCacheInfo } from '@jaskier/wasm-worker';
import { useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useWasmWorker } from '@/shared/hooks/useWasmWorker';
export function WasmEdgePanel() {
  const {
    isReady,
    version,
    maskPii,
    countTokens,
    benchmark,
    benchmarkSimilarity,
    cosineSimilarity,
    levenshteinSimilarity,
    jaccardSimilarity,
    batchSimilarity,
    analyzeText,
    wordFrequency,
    hashText,
    extractKeywords,
    error,
  } = useWasmWorker();
  const [activeTab, setActiveTab] = useState('pii');
  // ── PII tab state ──
  const [testInput, setTestInput] = useState(
    'Email: jan.kowalski@firma.pl, PESEL: 44051401359, Tel: +48 123 456 789, Karta: 4111 1111 1111 1111',
  );
  const [maskResult, setMaskResult] = useState(null);
  const [tokenCount, setTokenCount] = useState(null);
  const [benchResult, setBenchResult] = useState(null);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  // ── Similarity tab state ──
  const [simTextA, setSimTextA] = useState(
    'how to deploy a Rust application to Fly.io',
  );
  const [simTextB, setSimTextB] = useState(
    'deploying Rust apps on Fly.io platform',
  );
  const [simResult, setSimResult] = useState(null);
  const [batchQuery, setBatchQuery] = useState('deploy rust app');
  const [batchCandidates, setBatchCandidates] = useState(
    'deploy rust application\nconfigure database settings\nrust deployment guide\ncooking recipes\ndeploy node.js app',
  );
  const [batchResults, setBatchResults] = useState(null);
  const [simBenchResult, setSimBenchResult] = useState(null);
  // ── Analysis tab state ──
  const [analysisInput, setAnalysisInput] = useState(
    'The Rust programming language is a systems programming language focused on safety, speed, and concurrency. It achieves memory safety without garbage collection. Rust was originally designed by Graydon Hoare at Mozilla Research.',
  );
  const [textStats, setTextStats] = useState(null);
  const [wordFreqs, setWordFreqs] = useState(null);
  const [textHash, setTextHash] = useState(null);
  const [keywords, setKeywords] = useState(null);
  // ── PII handlers ──
  const handleMask = async () => {
    if (!isReady) return;
    setIsRunning(true);
    try {
      const result = await maskPii(testInput);
      setMaskResult(JSON.stringify(result, null, 2));
    } catch (err) {
      setMaskResult(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      );
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
      const largeInput = testInput
        .repeat(Math.ceil(50_000 / testInput.length))
        .slice(0, 50_000);
      const ms = await benchmark(largeInput, 100);
      const perOp = (ms / 100).toFixed(2);
      const charsPerSec = Math.round((50_000 * 100) / (ms / 1000));
      setBenchResult(
        `100 iterations on 50k chars: ${ms.toFixed(0)}ms total, ${perOp}ms/op, ${charsPerSec.toLocaleString()} chars/sec`,
      );
    } catch (err) {
      setBenchResult(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsRunning(false);
    }
  };
  const handleCacheInfo = async () => {
    const info = await getWasmCacheInfo();
    setCacheInfo(
      info.exists
        ? `${info.entries} file(s), ${(info.estimatedBytes / 1024).toFixed(1)} KB`
        : 'No WASM cache found',
    );
  };
  const handleClearCache = async () => {
    await clearWasmCache();
    setCacheInfo('Cache cleared');
  };
  // ── Similarity handlers ──
  const handleCompare = async () => {
    if (!isReady) return;
    setIsRunning(true);
    try {
      const [cosine, levenshtein, jaccard] = await Promise.all([
        cosineSimilarity(simTextA, simTextB),
        levenshteinSimilarity(simTextA, simTextB),
        jaccardSimilarity(simTextA, simTextB),
      ]);
      setSimResult({ cosine, levenshtein, jaccard });
    } finally {
      setIsRunning(false);
    }
  };
  const handleBatchCompare = async () => {
    if (!isReady) return;
    setIsRunning(true);
    try {
      const candidates = batchCandidates.split('\n').filter((c) => c.trim());
      const results = await batchSimilarity(batchQuery, candidates);
      setBatchResults(results);
    } finally {
      setIsRunning(false);
    }
  };
  const handleSimBenchmark = async () => {
    if (!isReady) return;
    setIsRunning(true);
    try {
      const ms = await benchmarkSimilarity(simTextA, simTextB, 1000);
      const perOp = (ms / 1000).toFixed(3);
      setSimBenchResult(
        `1000 comparisons: ${ms.toFixed(0)}ms total, ${perOp}ms/op`,
      );
    } catch (err) {
      setSimBenchResult(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsRunning(false);
    }
  };
  // ── Analysis handlers ──
  const handleAnalyze = async () => {
    if (!isReady) return;
    setIsRunning(true);
    try {
      const [stats, freqs, hash, kw] = await Promise.all([
        analyzeText(analysisInput),
        wordFrequency(analysisInput, 10),
        hashText(analysisInput),
        extractKeywords(analysisInput, 3),
      ]);
      setTextStats(stats);
      setWordFreqs(freqs);
      setTextHash(hash);
      setKeywords(kw);
    } finally {
      setIsRunning(false);
    }
  };
  const tabs = [
    { id: 'pii', label: 'PII Masking' },
    { id: 'similarity', label: 'Similarity' },
    { id: 'analysis', label: 'Analysis' },
  ];
  return _jsxs('div', {
    className: 'space-y-4',
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-3',
        children: [
          _jsx('h3', {
            className: 'text-lg font-semibold',
            children: 'WASM Edge Computing',
          }),
          _jsxs('span', {
            className: `inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isReady
                ? 'bg-emerald-500/20 text-emerald-400'
                : error
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-yellow-500/20 text-yellow-400'
            }`,
            children: [
              _jsx('span', {
                className: `h-1.5 w-1.5 rounded-full ${
                  isReady
                    ? 'bg-emerald-400'
                    : error
                      ? 'bg-red-400'
                      : 'bg-yellow-400 animate-pulse'
                }`,
              }),
              isReady ? `v${version}` : error ? 'Error' : 'Loading...',
            ],
          }),
        ],
      }),
      error &&
        _jsx('div', {
          className:
            'rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300',
          children: error,
        }),
      _jsx('div', {
        className: 'flex gap-1 rounded-lg bg-neutral-800 p-1',
        children: tabs.map((tab) =>
          _jsx(
            'button',
            {
              type: 'button',
              onClick: () => setActiveTab(tab.id),
              className: `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`,
              children: tab.label,
            },
            tab.id,
          ),
        ),
      }),
      activeTab === 'pii' &&
        _jsxs('div', {
          className: 'space-y-4',
          children: [
            _jsxs('div', {
              className: 'space-y-2',
              children: [
                _jsx('label', {
                  htmlFor: 'wasm-test-input',
                  className: 'text-sm text-neutral-400',
                  children: 'Test Input (PII data)',
                }),
                _jsx('textarea', {
                  id: 'wasm-test-input',
                  value: testInput,
                  onChange: (e) => setTestInput(e.target.value),
                  className:
                    'w-full rounded-lg border border-neutral-700 bg-neutral-800 p-3 text-sm text-neutral-200 font-mono resize-y min-h-[80px]',
                  rows: 3,
                }),
              ],
            }),
            _jsxs('div', {
              className: 'flex flex-wrap gap-2',
              children: [
                _jsx('button', {
                  type: 'button',
                  onClick: handleMask,
                  disabled: !isReady || isRunning,
                  className:
                    'rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
                  children: 'Mask PII',
                }),
                _jsx('button', {
                  type: 'button',
                  onClick: handleCountTokens,
                  disabled: !isReady,
                  className:
                    'rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
                  children: 'Count Tokens',
                }),
                _jsx('button', {
                  type: 'button',
                  onClick: handleBenchmark,
                  disabled: !isReady || isRunning,
                  className:
                    'rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
                  children: 'Benchmark (50k chars)',
                }),
                _jsx('button', {
                  type: 'button',
                  onClick: handleCacheInfo,
                  className:
                    'rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600 transition-colors',
                  children: 'Cache Info',
                }),
                _jsx('button', {
                  type: 'button',
                  onClick: handleClearCache,
                  className:
                    'rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600 transition-colors',
                  children: 'Clear Cache',
                }),
              ],
            }),
            tokenCount !== null &&
              _jsx('div', {
                className:
                  'rounded-lg border border-blue-500/30 bg-blue-500/10 p-3',
                children: _jsxs('span', {
                  className: 'text-sm text-blue-300',
                  children: [
                    'Estimated tokens:',
                    ' ',
                    _jsx('span', {
                      className: 'font-mono font-bold',
                      children: tokenCount,
                    }),
                  ],
                }),
              }),
            benchResult &&
              _jsx('div', {
                className:
                  'rounded-lg border border-amber-500/30 bg-amber-500/10 p-3',
                children: _jsx('span', {
                  className: 'text-sm text-amber-300 font-mono',
                  children: benchResult,
                }),
              }),
            cacheInfo &&
              _jsx('div', {
                className:
                  'rounded-lg border border-neutral-600 bg-neutral-800 p-3',
                children: _jsxs('span', {
                  className: 'text-sm text-neutral-300',
                  children: [
                    'WASM Cache: ',
                    _jsx('span', {
                      className: 'font-mono',
                      children: cacheInfo,
                    }),
                  ],
                }),
              }),
            maskResult &&
              _jsxs('div', {
                className: 'space-y-1',
                children: [
                  _jsx('label', {
                    htmlFor: 'wasm-mask-result',
                    className: 'text-sm text-neutral-400',
                    children: 'PII Masking Result',
                  }),
                  _jsx('pre', {
                    id: 'wasm-mask-result',
                    className:
                      'rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-xs text-neutral-200 overflow-auto max-h-[300px] font-mono',
                    children: maskResult,
                  }),
                ],
              }),
          ],
        }),
      activeTab === 'similarity' &&
        _jsxs('div', {
          className: 'space-y-4',
          children: [
            _jsxs('div', {
              className: 'space-y-2',
              children: [
                _jsx('label', {
                  htmlFor: 'sim-text-a',
                  className: 'text-sm text-neutral-400',
                  children: 'Text A',
                }),
                _jsx('input', {
                  id: 'sim-text-a',
                  value: simTextA,
                  onChange: (e) => setSimTextA(e.target.value),
                  className:
                    'w-full rounded-lg border border-neutral-700 bg-neutral-800 p-2.5 text-sm text-neutral-200 font-mono',
                }),
                _jsx('label', {
                  htmlFor: 'sim-text-b',
                  className: 'text-sm text-neutral-400',
                  children: 'Text B',
                }),
                _jsx('input', {
                  id: 'sim-text-b',
                  value: simTextB,
                  onChange: (e) => setSimTextB(e.target.value),
                  className:
                    'w-full rounded-lg border border-neutral-700 bg-neutral-800 p-2.5 text-sm text-neutral-200 font-mono',
                }),
              ],
            }),
            _jsxs('div', {
              className: 'flex gap-2',
              children: [
                _jsx('button', {
                  type: 'button',
                  onClick: handleCompare,
                  disabled: !isReady || isRunning,
                  className:
                    'rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
                  children: 'Compare',
                }),
                _jsx('button', {
                  type: 'button',
                  onClick: handleSimBenchmark,
                  disabled: !isReady || isRunning,
                  className:
                    'rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
                  children: 'Benchmark (1k ops)',
                }),
              ],
            }),
            simResult &&
              _jsxs('div', {
                className: 'grid grid-cols-3 gap-3',
                children: [
                  _jsx(ScoreCard, {
                    label: 'Cosine (trigram)',
                    value: simResult.cosine,
                    color: 'teal',
                  }),
                  _jsx(ScoreCard, {
                    label: 'Levenshtein',
                    value: simResult.levenshtein,
                    color: 'blue',
                  }),
                  _jsx(ScoreCard, {
                    label: 'Jaccard (words)',
                    value: simResult.jaccard,
                    color: 'purple',
                  }),
                ],
              }),
            simBenchResult &&
              _jsx('div', {
                className:
                  'rounded-lg border border-amber-500/30 bg-amber-500/10 p-3',
                children: _jsx('span', {
                  className: 'text-sm text-amber-300 font-mono',
                  children: simBenchResult,
                }),
              }),
            _jsxs('div', {
              className: 'border-t border-neutral-700 pt-4 space-y-2',
              children: [
                _jsx('h4', {
                  className: 'text-sm font-medium text-neutral-300',
                  children: 'Batch Similarity (semantic cache preview)',
                }),
                _jsx('label', {
                  htmlFor: 'batch-query',
                  className: 'text-sm text-neutral-400',
                  children: 'Query',
                }),
                _jsx('input', {
                  id: 'batch-query',
                  value: batchQuery,
                  onChange: (e) => setBatchQuery(e.target.value),
                  className:
                    'w-full rounded-lg border border-neutral-700 bg-neutral-800 p-2.5 text-sm text-neutral-200 font-mono',
                }),
                _jsx('label', {
                  htmlFor: 'batch-candidates',
                  className: 'text-sm text-neutral-400',
                  children: 'Candidates (one per line)',
                }),
                _jsx('textarea', {
                  id: 'batch-candidates',
                  value: batchCandidates,
                  onChange: (e) => setBatchCandidates(e.target.value),
                  className:
                    'w-full rounded-lg border border-neutral-700 bg-neutral-800 p-2.5 text-sm text-neutral-200 font-mono resize-y min-h-[80px]',
                  rows: 4,
                }),
                _jsx('button', {
                  type: 'button',
                  onClick: handleBatchCompare,
                  disabled: !isReady || isRunning,
                  className:
                    'rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
                  children: 'Rank Candidates',
                }),
                batchResults &&
                  _jsx('div', {
                    className: 'space-y-1.5',
                    children: batchResults.map((r) => {
                      const candidateLines = batchCandidates
                        .split('\n')
                        .filter((c) => c.trim());
                      return _jsxs(
                        'div',
                        {
                          className:
                            'flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 p-2.5',
                          children: [
                            _jsx('div', {
                              className:
                                'flex-1 text-sm text-neutral-200 font-mono truncate',
                              children: candidateLines[r.index],
                            }),
                            _jsxs('div', {
                              className:
                                'flex gap-2 text-xs font-mono shrink-0',
                              children: [
                                _jsxs('span', {
                                  className: 'text-teal-400',
                                  children: [
                                    (r.combined * 100).toFixed(1),
                                    '%',
                                  ],
                                }),
                                _jsxs('span', {
                                  className: 'text-neutral-500',
                                  children: [
                                    'cos:',
                                    (r.cosine * 100).toFixed(0),
                                    ' jac:',
                                    (r.jaccard * 100).toFixed(0),
                                  ],
                                }),
                              ],
                            }),
                          ],
                        },
                        r.index,
                      );
                    }),
                  }),
              ],
            }),
          ],
        }),
      activeTab === 'analysis' &&
        _jsxs('div', {
          className: 'space-y-4',
          children: [
            _jsxs('div', {
              className: 'space-y-2',
              children: [
                _jsx('label', {
                  htmlFor: 'analysis-input',
                  className: 'text-sm text-neutral-400',
                  children: 'Input Text',
                }),
                _jsx('textarea', {
                  id: 'analysis-input',
                  value: analysisInput,
                  onChange: (e) => setAnalysisInput(e.target.value),
                  className:
                    'w-full rounded-lg border border-neutral-700 bg-neutral-800 p-3 text-sm text-neutral-200 font-mono resize-y min-h-[100px]',
                  rows: 4,
                }),
              ],
            }),
            _jsx('button', {
              type: 'button',
              onClick: handleAnalyze,
              disabled: !isReady || isRunning,
              className:
                'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
              children: 'Analyze Text',
            }),
            textStats &&
              _jsxs('div', {
                className: 'grid grid-cols-3 gap-3',
                children: [
                  _jsx(StatCard, { label: 'Words', value: textStats.words }),
                  _jsx(StatCard, {
                    label: 'Sentences',
                    value: textStats.sentences,
                  }),
                  _jsx(StatCard, {
                    label: 'Unique words',
                    value: textStats.unique_words,
                  }),
                  _jsx(StatCard, {
                    label: 'Characters',
                    value: textStats.chars,
                  }),
                  _jsx(StatCard, {
                    label: 'Avg word length',
                    value: textStats.avg_word_length.toFixed(1),
                  }),
                  _jsx(StatCard, {
                    label: 'Reading time',
                    value:
                      textStats.estimated_reading_time_secs < 60
                        ? `${textStats.estimated_reading_time_secs}s`
                        : `${Math.ceil(textStats.estimated_reading_time_secs / 60)}m`,
                  }),
                ],
              }),
            textHash &&
              _jsxs('div', {
                className:
                  'rounded-lg border border-neutral-600 bg-neutral-800 p-2.5',
                children: [
                  _jsx('span', {
                    className: 'text-xs text-neutral-400',
                    children: 'FNV-1a hash: ',
                  }),
                  _jsx('span', {
                    className: 'text-xs text-neutral-200 font-mono',
                    children: textHash,
                  }),
                ],
              }),
            keywords &&
              keywords.length > 0 &&
              _jsxs('div', {
                className: 'space-y-1',
                children: [
                  _jsx('span', {
                    className: 'text-sm text-neutral-400',
                    children: 'Keywords',
                  }),
                  _jsx('div', {
                    className: 'flex flex-wrap gap-1.5',
                    children: keywords.slice(0, 15).map((kw) =>
                      _jsx(
                        'span',
                        {
                          className:
                            'rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs text-indigo-300',
                          children: kw,
                        },
                        kw,
                      ),
                    ),
                  }),
                ],
              }),
            wordFreqs &&
              wordFreqs.length > 0 &&
              _jsxs('div', {
                className: 'space-y-1',
                children: [
                  _jsx('span', {
                    className: 'text-sm text-neutral-400',
                    children: 'Word Frequency (top 10)',
                  }),
                  _jsx('div', {
                    className: 'space-y-1',
                    children: wordFreqs.map((wf) =>
                      _jsxs(
                        'div',
                        {
                          className: 'flex items-center gap-2',
                          children: [
                            _jsx('span', {
                              className:
                                'text-xs text-neutral-200 font-mono w-24 truncate',
                              children: wf.word,
                            }),
                            _jsx('div', {
                              className:
                                'flex-1 h-3 rounded-full bg-neutral-800 overflow-hidden',
                              children: _jsx('div', {
                                className:
                                  'h-full rounded-full bg-indigo-500/50',
                                style: {
                                  width: `${Math.min(wf.percentage * 3, 100)}%`,
                                },
                              }),
                            }),
                            _jsxs('span', {
                              className:
                                'text-xs text-neutral-500 font-mono w-16 text-right',
                              children: [wf.count, ' (', wf.percentage, '%)'],
                            }),
                          ],
                        },
                        wf.word,
                      ),
                    ),
                  }),
                ],
              }),
          ],
        }),
      _jsxs('div', {
        className:
          'rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 space-y-1',
        children: [
          _jsx('p', {
            className: 'text-xs text-neutral-500',
            children:
              'PII masking, token counting, text similarity, and text analysis run in a dedicated Web Worker via WebAssembly. The main UI thread is never blocked \u2014 maintaining 60 FPS during processing.',
          }),
          _jsx('p', {
            className: 'text-xs text-neutral-500',
            children:
              'WASM binaries are cached via Service Worker Cache API for instant 0ms loading on revisits. SIMD acceleration available via feature flag.',
          }),
        ],
      }),
    ],
  });
}
// ── Helper Components ──
function ScoreCard({ label, value, color }) {
  const pct = (value * 100).toFixed(1);
  const colorClasses = {
    teal: 'border-teal-500/30 bg-teal-500/10 text-teal-300',
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    purple: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  };
  return _jsxs('div', {
    className: `rounded-lg border p-3 text-center ${colorClasses[color] || colorClasses['teal']}`,
    children: [
      _jsxs('div', {
        className: 'text-xl font-bold font-mono',
        children: [pct, '%'],
      }),
      _jsx('div', { className: 'text-xs opacity-75 mt-0.5', children: label }),
    ],
  });
}
function StatCard({ label, value }) {
  return _jsxs('div', {
    className:
      'rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 text-center',
    children: [
      _jsx('div', {
        className: 'text-lg font-bold font-mono text-neutral-200',
        children: value,
      }),
      _jsx('div', {
        className: 'text-xs text-neutral-500 mt-0.5',
        children: label,
      }),
    ],
  });
}
