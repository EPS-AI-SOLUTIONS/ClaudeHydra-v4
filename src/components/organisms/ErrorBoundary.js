/** Jaskier Design System */
// src/components/organisms/ErrorBoundary.tsx
/**
 * Error Boundary — Unified across all Jaskier projects
 * =====================================================
 * React class-based error boundary with:
 *  - Dynamic import error detection + auto-reload (critical for lazy-loaded chunks)
 *  - Optional `fallback` prop for custom error UI
 *  - Default error card with AlertTriangle icon, error details, and retry button
 *  - Card atom + lucide-react icons for consistent styling
 */
import i18n from '@jaskier/i18n';
import { Button, Card } from '@jaskier/ui';
import { Component } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import AlertTriangle from '~icons/lucide/alert-triangle';
import RotateCcw from '~icons/lucide/rotate-ccw';

// ============================================================================
// HELPERS
// ============================================================================
/** Detect errors caused by stale chunk references after a new deployment. */
function isDynamicImportError(error) {
  if (!error) return false;
  const msg = error.message;
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Loading chunk')
  );
}
// ============================================================================
// COMPONENT
// ============================================================================
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error(
      '[ErrorBoundary] Caught error:',
      error,
      errorInfo.componentStack,
    );
    // Stale chunk after deploy — reload the page automatically
    if (isDynamicImportError(error)) {
      window.location.reload();
    }
  }
  handleRetry = () => {
    if (isDynamicImportError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return _jsx('div', {
        className:
          'min-h-screen flex items-center justify-center bg-[var(--matrix-bg-primary)] p-6',
        children: _jsx(Card, {
          variant: 'elevated',
          padding: 'lg',
          className: 'max-w-md w-full',
          children: _jsxs('div', {
            className: 'flex flex-col items-center gap-4 text-center',
            children: [
              _jsx('div', {
                className:
                  'w-14 h-14 rounded-2xl flex items-center justify-center bg-red-500/10 border border-red-500/20',
                children: _jsx(AlertTriangle, {
                  width: 28,
                  height: 28,
                  className: 'text-red-400',
                }),
              }),
              _jsxs('div', {
                children: [
                  _jsx('h2', {
                    className:
                      'text-lg font-bold font-mono text-[var(--matrix-text-primary)]',
                    children: i18n.t('common.somethingWentWrong'),
                  }),
                  _jsx('p', {
                    className: 'text-sm text-[var(--matrix-text-dim)] mt-1',
                    children: i18n.t('common.unexpectedError'),
                  }),
                ],
              }),
              this.state.error &&
                _jsx('pre', {
                  className:
                    'w-full text-xs text-red-400/80 bg-red-500/5 border border-red-500/10 rounded-lg p-3 overflow-auto max-h-32 text-left font-mono',
                  children: this.state.error.message,
                }),
              _jsx(Button, {
                variant: 'primary',
                size: 'md',
                leftIcon: _jsx(RotateCcw, { width: 16, height: 16 }),
                onClick: this.handleRetry,
                children: i18n.t('common.tryAgain'),
              }),
            ],
          }),
        }),
      });
    }
    return this.props.children;
  }
}
export default ErrorBoundary;
