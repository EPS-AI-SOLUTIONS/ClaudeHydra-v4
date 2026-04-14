import { cn } from '@jaskier/ui';
import { memo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import Terminal from '~icons/lucide/terminal';
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const ToolResultRenderer = memo(({ segments, isLight }) => {
  const { t } = useTranslation();
  if (segments.length === 0) return null;
  const detailsClasses = isLight
    ? 'border-black/10 bg-black/5'
    : 'border-white/10 bg-black/20';
  const summaryClasses = isLight
    ? 'text-black/60 hover:text-black/80'
    : 'text-white/60 hover:text-white/80';
  const preClasses = isLight
    ? 'text-black/70 border-black/5'
    : 'text-white/70 border-white/5';
  return _jsx('div', {
    className: 'mb-3',
    children: segments.map((segment) =>
      _jsxs(
        'details',
        {
          className: cn('my-2 rounded-lg border', detailsClasses),
          children: [
            _jsxs('summary', {
              'aria-expanded': 'false',
              tabIndex: 0,
              onKeyDown: (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.currentTarget.parentElement?.toggleAttribute('open');
                  e.currentTarget.setAttribute(
                    'aria-expanded',
                    e.currentTarget.parentElement?.hasAttribute('open')
                      ? 'true'
                      : 'false',
                  );
                }
              },
              className: cn(
                'cursor-pointer px-3 py-2 text-xs flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--matrix-accent)] focus-visible:rounded',
                summaryClasses,
              ),
              children: [
                _jsx(Terminal, { className: 'w-3.5 h-3.5' }),
                _jsx('span', {
                  children: t('chat.toolLabel', { name: segment.name }),
                }),
                _jsx('span', {
                  className: 'ml-auto text-[10px]',
                  children: t('chat.linesCount', {
                    count: segment.content.split('\n').length,
                  }),
                }),
              ],
            }),
            _jsx('pre', {
              className: cn(
                'overflow-x-auto px-3 py-2 text-xs border-t max-h-60 overflow-y-auto',
                preClasses,
              ),
              children: _jsx('code', { children: segment.content }),
            }),
          ],
        },
        `tool-${segment.name}-${segment.content.slice(0, 20)}`,
      ),
    ),
  });
});
ToolResultRenderer.displayName = 'ToolResultRenderer';
