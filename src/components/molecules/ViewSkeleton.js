// src/components/molecules/ViewSkeleton.tsx
/**
 * ViewSkeleton Molecule
 * ======================
 * Full-view loading skeleton shown as the Suspense fallback while
 * lazy-loaded views are being fetched. Mirrors the typical view layout:
 * a header row + content area, all rendered with the Skeleton atom
 * and a matrix-green shimmer effect.
 */
import { Skeleton } from '@jaskier/ui';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ViewSkeleton() {
  const { t } = useTranslation();
  return _jsxs('output', {
    className: 'h-full flex flex-col p-4 sm:p-6 gap-6 animate-in fade-in duration-300 block',
    'aria-busy': 'true',
    'aria-live': 'polite',
    'aria-label': t('common.loadingView', 'Loading view'),
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-3',
        children: [
          _jsx(Skeleton, {
            shape: 'rectangle',
            width: 40,
            height: 40,
            className: '!rounded-lg border border-[var(--matrix-accent)]/10',
          }),
          _jsxs('div', {
            className: 'flex flex-col gap-2 flex-1',
            children: [
              _jsx(Skeleton, { shape: 'line', width: '40%', height: 18 }),
              _jsx(Skeleton, { shape: 'line', width: '25%', height: 12 }),
            ],
          }),
        ],
      }),
      _jsxs('div', {
        className: 'flex items-center gap-3',
        children: [
          _jsx(Skeleton, { shape: 'rectangle', width: 120, height: 32, className: '!rounded-md' }),
          _jsx(Skeleton, { shape: 'rectangle', width: 100, height: 32, className: '!rounded-md' }),
          _jsx('div', { className: 'flex-1' }),
          _jsx(Skeleton, { shape: 'rectangle', width: 80, height: 32, className: '!rounded-md' }),
        ],
      }),
      _jsxs('div', {
        className:
          'flex-1 rounded-lg border border-[var(--matrix-border)]/30 bg-[var(--matrix-bg-secondary)]/20 p-4 space-y-4',
        children: [
          _jsx(Skeleton, { shape: 'rectangle', width: '100%', height: 64 }),
          _jsx(Skeleton, { shape: 'rectangle', width: '100%', height: 64 }),
          _jsx(Skeleton, { shape: 'rectangle', width: '100%', height: 64 }),
          _jsx(Skeleton, { shape: 'rectangle', width: '70%', height: 64 }),
        ],
      }),
    ],
  });
}
