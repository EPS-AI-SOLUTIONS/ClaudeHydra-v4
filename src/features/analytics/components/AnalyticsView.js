/**
 * AnalyticsView — Lazy-loading wrapper for the Analytics dashboard.
 *
 * M1-02: Code-splits the heavy analytics content (useTokenUsage, useLatency,
 * useCostEstimate hooks, chart components, formatters) into a separate chunk
 * loaded on demand via React.lazy(). Shows a ViewSkeleton immediately while
 * the AnalyticsViewContent chunk is fetched.
 */
import { lazy, Suspense } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';
import { ViewSkeleton } from '@/components/molecules/ViewSkeleton';

const AnalyticsViewContent = lazy(() => import('./AnalyticsViewContent'));
export function AnalyticsView() {
  return _jsx(Suspense, {
    fallback: _jsx(ViewSkeleton, {}),
    children: _jsx(AnalyticsViewContent, {}),
  });
}
AnalyticsView.displayName = 'AnalyticsView';
export default AnalyticsView;
