/**
 * ErrorBoundary — React class-based error boundary with matrix-green retry UI.
 * Catches rendering errors in the component tree and shows a styled fallback.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card } from '@/components/atoms/Card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-[var(--matrix-bg-primary)] p-6">
          <Card variant="glass" padding="lg" className="max-w-md w-full text-center space-y-4">
            <div className="text-4xl font-mono text-[var(--matrix-accent)]">!</div>
            <h2 className="text-lg font-semibold text-[var(--matrix-text-primary)]">Something went wrong</h2>
            <p className="text-sm text-[var(--matrix-text-secondary)]">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-[var(--matrix-accent)] text-[var(--matrix-bg-primary)] hover:shadow-[0_0_15px_var(--matrix-accent)] transition-all"
            >
              Retry
            </button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
