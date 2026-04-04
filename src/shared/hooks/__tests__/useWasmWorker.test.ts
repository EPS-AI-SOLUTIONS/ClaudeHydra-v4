import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock the WasmClient since WASM can't load in jsdom
vi.mock('@jaskier/wasm-worker', () => ({
  WasmClient: vi.fn().mockImplementation(() => ({
    initialized: false,
    wasmVersion: '0.2.0',
    ready: vi.fn().mockResolvedValue('0.2.0'),
    dispose: vi.fn(),
    maskPii: vi.fn().mockResolvedValue({ masked: '***', detections: [] }),
    maskEmails: vi.fn().mockResolvedValue('***'),
    maskCards: vi.fn().mockResolvedValue('***'),
    maskPesel: vi.fn().mockResolvedValue('***'),
    maskPhones: vi.fn().mockResolvedValue('***'),
    maskNip: vi.fn().mockResolvedValue('***'),
    maskIban: vi.fn().mockResolvedValue('***'),
    countTokens: vi.fn().mockResolvedValue(10),
    countTokensBatch: vi.fn().mockResolvedValue([10, 20]),
    cosineSimilarity: vi.fn().mockResolvedValue(0.9),
    cosineSimilarityNgram: vi.fn().mockResolvedValue(0.85),
    levenshteinDistance: vi.fn().mockResolvedValue(3),
    levenshteinSimilarity: vi.fn().mockResolvedValue(0.7),
    jaccardSimilarity: vi.fn().mockResolvedValue(0.5),
    fuzzySearch: vi.fn().mockResolvedValue([]),
    batchSimilarity: vi.fn().mockResolvedValue([]),
    analyzeText: vi.fn().mockResolvedValue({ wordCount: 5 }),
    wordFrequency: vi.fn().mockResolvedValue([]),
    hashText: vi.fn().mockResolvedValue('abc123'),
    smartTruncate: vi.fn().mockResolvedValue('hello...'),
    extractKeywords: vi.fn().mockResolvedValue([]),
    benchmark: vi.fn().mockResolvedValue(1.5),
    benchmarkSimilarity: vi.fn().mockResolvedValue(2.0),
  })),
}));

const { useWasmWorker } = await import('../useWasmWorker');

describe('useWasmWorker', () => {
  it('returns isReady as false initially', () => {
    const { result } = renderHook(() => useWasmWorker());
    expect(result.current.isReady).toBe(false);
  });

  it('returns all PII masking functions', () => {
    const { result } = renderHook(() => useWasmWorker());
    expect(typeof result.current.maskPii).toBe('function');
    expect(typeof result.current.maskEmails).toBe('function');
    expect(typeof result.current.maskCards).toBe('function');
    expect(typeof result.current.maskPesel).toBe('function');
    expect(typeof result.current.maskPhones).toBe('function');
    expect(typeof result.current.maskNip).toBe('function');
    expect(typeof result.current.maskIban).toBe('function');
  });

  it('returns token counting functions', () => {
    const { result } = renderHook(() => useWasmWorker());
    expect(typeof result.current.countTokens).toBe('function');
    expect(typeof result.current.countTokensBatch).toBe('function');
  });

  it('returns similarity functions', () => {
    const { result } = renderHook(() => useWasmWorker());
    expect(typeof result.current.cosineSimilarity).toBe('function');
    expect(typeof result.current.levenshteinDistance).toBe('function');
    expect(typeof result.current.jaccardSimilarity).toBe('function');
    expect(typeof result.current.fuzzySearch).toBe('function');
  });

  it('returns text analysis functions', () => {
    const { result } = renderHook(() => useWasmWorker());
    expect(typeof result.current.analyzeText).toBe('function');
    expect(typeof result.current.wordFrequency).toBe('function');
    expect(typeof result.current.hashText).toBe('function');
    expect(typeof result.current.smartTruncate).toBe('function');
    expect(typeof result.current.extractKeywords).toBe('function');
  });

  it('returns error as null initially', () => {
    const { result } = renderHook(() => useWasmWorker());
    expect(result.current.error).toBeNull();
  });
});
