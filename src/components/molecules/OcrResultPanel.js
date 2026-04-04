/** Jaskier Shared Pattern — OcrResultPanel */
import { Badge, Button, Card, cn } from '@jaskier/ui';
import DOMPurify from 'dompurify';
import { Check, ChevronLeft, ChevronRight, Code2, Copy, Download, Eye, FileDown, Loader2 } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'br',
    'hr',
    'span',
    'div',
    'pre',
    'code',
  ],
  ALLOWED_ATTR: ['data-page', 'colspan', 'rowspan'],
};
/** Convert markdown text to a simple HTML string for rich clipboard copy. */
function markdownToHtml(md) {
  // Tables
  const lines = md.split('\n');
  const out = [];
  let inTable = false;
  let headerDone = false;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    const cells = line.match(/^\|(.+)\|$/);
    if (cells) {
      // Check if next line is separator (|---|---|)
      const nextLine = lines[i + 1]?.trim() ?? '';
      const isSeparator = /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|$/.test(line);
      if (isSeparator) {
        // Skip separator row
        continue;
      }
      if (!inTable) {
        out.push('<table style="border-collapse:collapse;border:1px solid #555;">');
        inTable = true;
        headerDone = false;
      }
      const cellValues = (cells[1] ?? '').split('|').map((c) => c.trim());
      const isSep = /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|$/.test(nextLine);
      if (!headerDone && isSep) {
        // This is header row
        out.push('<tr>');
        for (const c of cellValues) {
          out.push(
            `<th style="border:1px solid #555;padding:4px 8px;font-weight:bold;">${processInline(escapeHtml(c))}</th>`,
          );
        }
        out.push('</tr>');
        headerDone = true;
      } else {
        out.push('<tr>');
        for (const c of cellValues) {
          out.push(`<td style="border:1px solid #555;padding:4px 8px;">${processInline(escapeHtml(c))}</td>`);
        }
        out.push('</tr>');
      }
    } else {
      if (inTable) {
        out.push('</table>');
        inTable = false;
        headerDone = false;
      }
      // Headers
      if (line.startsWith('### ')) {
        out.push(`<h3>${processInline(escapeHtml(line.slice(4)))}</h3>`);
      } else if (line.startsWith('## ')) {
        out.push(`<h2>${processInline(escapeHtml(line.slice(3)))}</h2>`);
      } else if (line.startsWith('# ')) {
        out.push(`<h1>${processInline(escapeHtml(line.slice(2)))}</h1>`);
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        out.push(`<li>${processInline(escapeHtml(line.slice(2)))}</li>`);
      } else if (/^\d+\.\s/.test(line)) {
        out.push(`<li>${processInline(escapeHtml(line.replace(/^\d+\.\s/, '')))}</li>`);
      } else if (line === '') {
        out.push('<br/>');
      } else {
        out.push(`<p>${processInline(escapeHtml(line))}</p>`);
      }
    }
  }
  if (inTable) out.push('</table>');
  return out.join('\n');
}
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/** Process inline markdown: **bold** → <strong>, *italic* → <em>. Call AFTER escapeHtml. */
function processInline(s) {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
}
const OcrResultPanel = memo(function OcrResultPanel({
  pages,
  totalPages,
  processingTimeMs,
  provider,
  className,
  outputFormat = 'text',
  onFormatChange,
  isFormatLoading,
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const [showFullText, setShowFullText] = useState(false);
  const [showRendered, setShowRendered] = useState(true);
  const [copied, setCopied] = useState(false);
  const renderedRef = useRef(null);
  const page = pages[currentPage];
  const hasMultiplePages = pages.length > 1;
  const fullText = useMemo(() => pages.map((p) => p.text).join('\n\n---\n\n'), [pages]);
  const currentText = showFullText ? fullText : (page?.text ?? '');
  const sanitizedHtml = useMemo(
    () => (outputFormat === 'html' ? DOMPurify.sanitize(currentText, PURIFY_CONFIG) : ''),
    [currentText, outputFormat],
  );
  /** Rich copy: text/html (for Word/Excel/Docs) + text/plain (for editors). */
  const handleCopy = useCallback(async () => {
    try {
      const html = outputFormat === 'html' ? currentText : markdownToHtml(currentText);
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([currentText], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        }),
      ]);
    } catch {
      // Fallback for older browsers / insecure context
      await navigator.clipboard.writeText(currentText);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [currentText, outputFormat]);
  const handleExportMd = useCallback(() => {
    const blob = new Blob([fullText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-result-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [fullText]);
  /** Export as .html (Word-compatible with formatted tables). */
  const handleExportHtml = useCallback(() => {
    const body = outputFormat === 'html' ? fullText : markdownToHtml(fullText);
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>OCR Result</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;max-width:800px;margin:20px auto}
table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #555;padding:6px 10px;text-align:left}
th{font-weight:bold;background:#f0f0f0}h1,h2,h3{margin:16px 0 8px}</style>
</head><body>${body}</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-result-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [fullText, outputFormat]);
  if (!pages.length) return null;
  return _jsxs(Card, {
    className: cn('flex flex-col gap-3', className),
    children: [
      _jsxs('div', {
        className: 'flex items-center justify-between gap-2 flex-wrap',
        children: [
          _jsxs('div', {
            className: 'flex items-center gap-2',
            children: [
              _jsx('span', {
                className: 'text-sm font-medium',
                style: { color: 'var(--matrix-text-primary)' },
                children: 'OCR',
              }),
              _jsx(Badge, { variant: 'accent', size: 'sm', children: provider }),
              _jsxs(Badge, {
                variant: 'default',
                size: 'sm',
                children: [totalPages, ' ', totalPages === 1 ? 'strona' : totalPages < 5 ? 'strony' : 'stron'],
              }),
              _jsxs('span', {
                className: 'text-xs',
                style: { color: 'var(--matrix-text-secondary)' },
                children: [(processingTimeMs / 1000).toFixed(1), 's'],
              }),
            ],
          }),
          _jsxs('div', {
            className: 'flex items-center gap-1',
            children: [
              hasMultiplePages &&
                _jsx(Button, {
                  variant: 'ghost',
                  size: 'sm',
                  onClick: () => setShowFullText((v) => !v),
                  children: showFullText ? 'Strony' : 'Pełny tekst',
                }),
              onFormatChange &&
                _jsxs('div', {
                  className: 'flex items-center rounded-md overflow-hidden border',
                  style: { borderColor: 'var(--matrix-border)' },
                  children: [
                    _jsx('button', {
                      type: 'button',
                      onClick: () => onFormatChange('text'),
                      disabled: isFormatLoading,
                      className: cn(
                        'px-2 py-0.5 text-[10px] font-medium transition-colors',
                        outputFormat === 'text'
                          ? 'bg-[var(--matrix-accent)]/20 text-[var(--matrix-accent)]'
                          : 'text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-text-primary)]',
                      ),
                      children: 'Text',
                    }),
                    _jsx('button', {
                      type: 'button',
                      onClick: () => onFormatChange('html'),
                      disabled: isFormatLoading,
                      className: cn(
                        'px-2 py-0.5 text-[10px] font-medium transition-colors',
                        outputFormat === 'html'
                          ? 'bg-[var(--matrix-accent)]/20 text-[var(--matrix-accent)]'
                          : 'text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-text-primary)]',
                      ),
                      children: isFormatLoading ? _jsx(Loader2, { className: 'w-3 h-3 animate-spin' }) : 'HTML',
                    }),
                  ],
                }),
              _jsx(Button, {
                variant: 'ghost',
                size: 'sm',
                onClick: () => setShowRendered((v) => !v),
                title: showRendered ? 'Pokaż źródło' : 'Pokaż sformatowany',
                children: showRendered
                  ? _jsx(Code2, { className: 'w-3.5 h-3.5' })
                  : _jsx(Eye, { className: 'w-3.5 h-3.5' }),
              }),
              _jsx(Button, {
                variant: 'ghost',
                size: 'sm',
                onClick: handleCopy,
                title: 'Kopiuj (z formatowaniem)',
                children: copied ? _jsx(Check, { className: 'w-3.5 h-3.5' }) : _jsx(Copy, { className: 'w-3.5 h-3.5' }),
              }),
              _jsx(Button, {
                variant: 'ghost',
                size: 'sm',
                onClick: handleExportMd,
                title: 'Pobierz .md',
                children: _jsx(Download, { className: 'w-3.5 h-3.5' }),
              }),
              _jsx(Button, {
                variant: 'ghost',
                size: 'sm',
                onClick: handleExportHtml,
                title: 'Pobierz .html (Word)',
                children: _jsx(FileDown, { className: 'w-3.5 h-3.5' }),
              }),
            ],
          }),
        ],
      }),
      hasMultiplePages &&
        !showFullText &&
        _jsxs('div', {
          className: 'flex items-center justify-center gap-2',
          children: [
            _jsx(Button, {
              variant: 'ghost',
              size: 'sm',
              disabled: currentPage === 0,
              onClick: () => setCurrentPage((p) => p - 1),
              children: _jsx(ChevronLeft, { className: 'w-4 h-4' }),
            }),
            _jsxs('span', {
              className: 'text-xs tabular-nums',
              style: { color: 'var(--matrix-text-secondary)' },
              children: [page?.page_number ?? currentPage + 1, ' / ', totalPages],
            }),
            _jsx(Button, {
              variant: 'ghost',
              size: 'sm',
              disabled: currentPage >= pages.length - 1,
              onClick: () => setCurrentPage((p) => p + 1),
              children: _jsx(ChevronRight, { className: 'w-4 h-4' }),
            }),
          ],
        }),
      outputFormat === 'html'
        ? showRendered
          ? _jsx('div', {
              ref: renderedRef,
              className: 'ocr-html-content text-xs leading-relaxed max-h-96 overflow-y-auto rounded-md p-3',
              style: {
                color: 'var(--matrix-text-primary)',
                backgroundColor: 'var(--matrix-bg-secondary)',
                border: '1px solid var(--matrix-border)',
              },
              dangerouslySetInnerHTML: { __html: sanitizedHtml },
            })
          : _jsx('pre', {
              className:
                'whitespace-pre-wrap break-words text-xs leading-relaxed max-h-96 overflow-y-auto rounded-md p-3',
              style: {
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                color: 'var(--matrix-text-primary)',
                backgroundColor: 'var(--matrix-bg-secondary)',
                border: '1px solid var(--matrix-border)',
              },
              children: currentText,
            })
        : showRendered
          ? _jsx('div', {
              ref: renderedRef,
              className: 'ocr-rendered text-xs leading-relaxed max-h-96 overflow-y-auto rounded-md p-3',
              style: {
                color: 'var(--matrix-text-primary)',
                backgroundColor: 'var(--matrix-bg-secondary)',
                border: '1px solid var(--matrix-border)',
              },
              children: _jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], children: currentText }),
            })
          : _jsx('pre', {
              className:
                'whitespace-pre-wrap break-words text-xs leading-relaxed max-h-96 overflow-y-auto rounded-md p-3',
              style: {
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                color: 'var(--matrix-text-primary)',
                backgroundColor: 'var(--matrix-bg-secondary)',
                border: '1px solid var(--matrix-border)',
              },
              children: currentText,
            }),
    ],
  });
});
export default OcrResultPanel;
