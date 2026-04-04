// src/components/molecules/CodeBlock.tsx
/**
 * CodeBlock Molecule
 * ==================
 * Syntax-highlighted code display with copy-to-clipboard, language badge,
 * optional line numbers, and glass-panel wrapper.
 *
 * Uses `hljs` CSS classes for syntax highlighting — works with rehype-highlight
 * when rendered inside react-markdown, and displays cleanly as plain code standalone.
 *
 * ClaudeHydra: Green Matrix accent with glass-panel from globals.css.
 */
import { cn } from '@jaskier/ui';
import { Check, Clipboard, Maximize2, Terminal } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { copyToClipboard } from '@/shared/utils/clipboard';
import { useViewStore } from '@/stores/viewStore';

// ---------------------------------------------------------------------------
// Language display names
// ---------------------------------------------------------------------------
const LANGUAGE_NAMES = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  jsx: 'JSX',
  py: 'Python',
  python: 'Python',
  rs: 'Rust',
  rust: 'Rust',
  go: 'Go',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  cs: 'C#',
  csharp: 'C#',
  rb: 'Ruby',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kt: 'Kotlin',
  kotlin: 'Kotlin',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  xml: 'XML',
  md: 'Markdown',
  markdown: 'Markdown',
  sql: 'SQL',
  sh: 'Shell',
  shell: 'Shell',
  bash: 'Bash',
  powershell: 'PowerShell',
  dockerfile: 'Dockerfile',
  toml: 'TOML',
};
// ---------------------------------------------------------------------------
// Auto-open tracking
// ---------------------------------------------------------------------------
const autoOpenedArtifacts = new Set();
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const _CodeBlock = memo(function CodeBlock({
  code,
  language,
  showLineNumbers = false,
  maxHeight = '24rem',
  className,
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const preRef = useRef(null);
  const lang = language?.toLowerCase() ?? '';
  const displayName = LANGUAGE_NAMES[lang] ?? (lang ? lang.toUpperCase() : 'Code');
  const setActiveArtifact = useViewStore((s) => s.setActiveArtifact);
  // Split into lines for line-number rendering
  const lines = useMemo(() => code.split('\n'), [code]);
  // ----- Auto-open large artifacts -------------------------------------
  const isArtifactLanguage = [
    'html',
    'css',
    'javascript',
    'typescript',
    'tsx',
    'jsx',
    'json',
    'yaml',
    'mermaid',
    'svg',
    'python',
    'rust',
    'go',
  ].includes(lang);
  useEffect(() => {
    if (isArtifactLanguage && lines.length >= 15 && code.length > 300) {
      // Create a hash/id to track if we've already opened this exact block
      const artifactId = code.substring(0, 100).replace(/\s/g, '');
      if (!autoOpenedArtifacts.has(artifactId)) {
        autoOpenedArtifacts.add(artifactId);
        setActiveArtifact({ id: artifactId, code, language: lang, title: 'Generated Artifact' });
      } else {
        // Update it live if it's currently active (streaming)
        const currentActive = useViewStore.getState().activeArtifact;
        if (currentActive?.id === artifactId) {
          setActiveArtifact({ id: artifactId, code, language: lang, title: 'Generated Artifact' });
        }
      }
    }
  }, [code, isArtifactLanguage, lines.length, lang, setActiveArtifact]);
  // ----- Copy to clipboard ---------------------------------------------
  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);
  // ----- Render --------------------------------------------------------
  return _jsxs('div', {
    className: cn('glass-panel overflow-hidden my-3 group', className),
    children: [
      _jsxs('div', {
        className:
          'flex items-center justify-between px-4 py-2 border-b border-[var(--glass-border)] bg-[var(--matrix-bg-secondary)]/50',
        children: [
          _jsxs('div', {
            className: 'flex items-center gap-2',
            children: [
              _jsx(Terminal, { size: 14, className: 'text-[var(--matrix-accent)]' }),
              _jsx('span', {
                className: 'text-xs font-mono text-[var(--matrix-text-secondary)] uppercase tracking-wider',
                children: displayName,
              }),
            ],
          }),
          _jsxs('div', {
            className: 'flex items-center gap-1',
            children: [
              isArtifactLanguage &&
                lines.length >= 5 &&
                _jsxs('button', {
                  type: 'button',
                  onClick: () =>
                    setActiveArtifact({ id: code.substring(0, 50), code, language: lang, title: 'Code Artifact' }),
                  className: cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono transition-colors',
                    'text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-accent)] hover:bg-[var(--matrix-accent)]/10',
                  ),
                  title: 'Open in Side Panel',
                  children: [_jsx(Maximize2, { size: 14 }), 'Open Panel'],
                }),
              _jsx('button', {
                type: 'button',
                onClick: handleCopy,
                className: cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono transition-colors',
                  'text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-accent)] hover:bg-[var(--matrix-accent)]/10',
                ),
                'aria-label': copied ? t('common.copied') : t('common.copyCode'),
                children: _jsx(AnimatePresence, {
                  mode: 'wait',
                  initial: false,
                  children: copied
                    ? _jsxs(
                        motion.span,
                        {
                          initial: { scale: 0.5, opacity: 0 },
                          animate: { scale: 1, opacity: 1 },
                          exit: { scale: 0.5, opacity: 0 },
                          transition: { duration: 0.15 },
                          className: 'flex items-center gap-1 text-[var(--matrix-success)]',
                          children: [_jsx(Check, { size: 14 }), t('common.copied')],
                        },
                        'check',
                      )
                    : _jsxs(
                        motion.span,
                        {
                          initial: { scale: 0.5, opacity: 0 },
                          animate: { scale: 1, opacity: 1 },
                          exit: { scale: 0.5, opacity: 0 },
                          transition: { duration: 0.15 },
                          className: 'flex items-center gap-1',
                          children: [_jsx(Clipboard, { size: 14 }), t('common.copy')],
                        },
                        'copy',
                      ),
                }),
              }),
            ],
          }),
        ],
      }),
      _jsx('div', {
        className: 'overflow-auto',
        style: { maxHeight },
        children: _jsxs('pre', {
          ref: preRef,
          className: cn(
            'm-0 p-4 bg-transparent text-sm leading-relaxed',
            'font-mono text-[var(--matrix-text-primary)]',
            showLineNumbers && 'flex',
          ),
          children: [
            showLineNumbers &&
              _jsx('div', {
                className:
                  'select-none pr-4 mr-4 border-r border-[var(--glass-border)] text-right text-[var(--matrix-text-secondary)]',
                'aria-hidden': 'true',
                children: lines.map((_, i) => _jsx('div', { className: 'leading-relaxed', children: i + 1 }, i)),
              }),
            _jsx('code', { className: cn(lang && `language-${lang}`, 'block flex-1'), children: code }),
          ],
        }),
      }),
    ],
  });
});
