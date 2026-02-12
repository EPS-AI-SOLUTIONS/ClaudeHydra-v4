import { describe, it, expect } from 'vitest';
import { fnv1a32, processMarkdownSync } from '../markdownUtils';

// ===========================================================================
// fnv1a32 — FNV-1a 32-bit content hashing
// ===========================================================================
describe('fnv1a32', () => {
  it('is deterministic — same input always produces same hash', () => {
    const input = 'Hello, World!';
    expect(fnv1a32(input)).toBe(fnv1a32(input));
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = fnv1a32('hello');
    const hash2 = fnv1a32('world');
    expect(hash1).not.toBe(hash2);
  });

  it('returns a string hash for empty input', () => {
    const hash = fnv1a32('');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('returns a base-36 encoded string', () => {
    const hash = fnv1a32('test string');
    // base-36 uses only [0-9a-z]
    expect(hash).toMatch(/^[0-9a-z]+$/);
  });
});

// ===========================================================================
// processMarkdownSync — lightweight sync fallback
// ===========================================================================
describe('processMarkdownSync', () => {
  it('trims leading and trailing whitespace', () => {
    const result = processMarkdownSync('  hello  ');
    expect(result).toBe('hello');
  });

  it('collapses 3+ consecutive newlines to 2', () => {
    const input = 'line1\n\n\n\nline2';
    const result = processMarkdownSync(input);
    expect(result).toBe('line1\n\nline2');
  });

  it('preserves double newlines (paragraph breaks)', () => {
    const input = 'para1\n\npara2';
    const result = processMarkdownSync(input);
    expect(result).toBe('para1\n\npara2');
  });

  it('strips <script> tags (XSS prevention)', () => {
    const input = 'safe text<script>alert("xss")</script>more text';
    const result = processMarkdownSync(input);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('</script');
    expect(result).toContain('safe text');
    expect(result).toContain('more text');
  });

  it('strips <iframe>, <object>, <embed>, <form> tags', () => {
    const input = '<iframe src="evil"></iframe><object data="x"></object><embed src="y"><form action="z"></form>';
    const result = processMarkdownSync(input);
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('<object');
    expect(result).not.toContain('<embed');
    expect(result).not.toContain('<form');
  });

  it('tags empty fenced code blocks with "text" language', () => {
    const input = '```\nconsole.log("hi")\n```';
    const result = processMarkdownSync(input);
    expect(result).toContain('```text');
  });

  it('preserves code blocks that already have a language', () => {
    const input = '```javascript\nconsole.log("hi")\n```';
    const result = processMarkdownSync(input);
    expect(result).toContain('```javascript');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(processMarkdownSync('   ')).toBe('');
  });

  it('handles combined scenarios correctly', () => {
    const input = '  # Title\n\n\n\n<script>bad()</script>\n\n```\ncode\n```  ';
    const result = processMarkdownSync(input);

    expect(result).toContain('# Title');
    expect(result).not.toContain('<script');
    expect(result).toContain('```text');
    // 4 newlines collapsed to 2
    expect(result).not.toContain('\n\n\n');
  });
});
