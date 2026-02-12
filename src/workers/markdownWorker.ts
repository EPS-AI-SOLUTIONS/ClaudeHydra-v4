// src/workers/markdownWorker.ts
/**
 * Markdown Parsing Web Worker
 * ============================
 * Offloads markdown pre-processing to a dedicated thread so large chat
 * messages never block the main-thread UI. Communicates via typed
 * `MarkdownWorkerMessage` / `MarkdownWorkerResponse` messages.
 *
 * Processing steps:
 * 1. Normalise whitespace (trim, collapse excessive blank lines)
 * 2. Detect and tag fenced code blocks with language hints
 * 3. Sanitise raw HTML tags (strip script/iframe)
 * 4. Return the cleaned markdown string ready for react-markdown
 */

// ---------------------------------------------------------------------------
// Message Types (shared with the hook via import type)
// ---------------------------------------------------------------------------

export interface MarkdownWorkerRequest {
  type: 'parse';
  id: string;
  content: string;
}

export interface MarkdownWorkerResponse {
  type: 'parsed';
  id: string;
  result: string;
}

// ---------------------------------------------------------------------------
// Processing helpers
// ---------------------------------------------------------------------------

/** Collapse 3+ consecutive blank lines into 2. */
function normaliseWhitespace(md: string): string {
  return md.trim().replace(/\n{3,}/g, '\n\n');
}

/** Strip dangerous HTML tags that should never appear in chat output. */
function sanitiseHtml(md: string): string {
  return md.replace(/<\s*\/?\s*(script|iframe|object|embed|form)\b[^>]*>/gi, '');
}

/**
 * Ensure fenced code blocks without a language tag get a default hint
 * so downstream syntax highlighters do not choke on bare triple-backticks.
 */
function tagCodeBlocks(md: string): string {
  return md.replace(/^```\s*$/gm, '```text');
}

/** Full pipeline applied to every incoming markdown string. */
function processMarkdown(raw: string): string {
  let result = normaliseWhitespace(raw);
  result = sanitiseHtml(result);
  result = tagCodeBlocks(result);
  return result;
}

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------

self.addEventListener('message', (event: MessageEvent<MarkdownWorkerRequest>) => {
  const { type, id, content } = event.data;

  if (type === 'parse') {
    const result = processMarkdown(content);
    const response: MarkdownWorkerResponse = { type: 'parsed', id, result };
    self.postMessage(response);
  }
});
