/**
 * Pure utility functions for markdown pre-processing.
 * Extracted from useMarkdownWorker to allow direct unit testing.
 *
 * @internal — these are implementation details shared between the hook
 * and the markdown Web Worker fallback path.
 */

// ---------------------------------------------------------------------------
// Content hashing (FNV-1a 32-bit) — fast, no crypto overhead
// ---------------------------------------------------------------------------

export function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// Lightweight sync fallback (mirrors worker pipeline)
// ---------------------------------------------------------------------------

export function processMarkdownSync(raw: string): string {
  let result = raw.trim().replace(/\n{3,}/g, '\n\n');
  result = result.replace(/<\s*\/?\s*(script|iframe|object|embed|form)\b[^>]*>/gi, '');
  result = result.replace(/^```\s*$/gm, '```text');
  return result;
}
