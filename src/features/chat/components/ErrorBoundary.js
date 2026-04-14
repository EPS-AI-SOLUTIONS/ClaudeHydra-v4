import { Button, cn } from '@jaskier/ui';
import { Component } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { isTelemetryEnabled } from '@/shared/hooks/useSettings';
import AlertTriangle from '~icons/lucide/alert-triangle';
import RefreshCcw from '~icons/lucide/refresh-ccw';
export class ErrorBoundary extends Component {
  state = {
    hasError: false,
    error: null,
  };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error(
      `[ErrorBoundary] Caught error in ${this.props.name || 'Component'}:`,
      error,
      errorInfo,
    );
    // Telemetry - Graceful degradation logger (respects telemetry setting)
    if (isTelemetryEnabled()) {
      try {
        const payload = JSON.stringify({
          event: 'client_error',
          name: this.props.name || 'Component',
          error: error.message,
          stack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
        });
        // Wyślij bez blokowania wątku
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            '/api/telemetry/error',
            new Blob([payload], { type: 'application/json' }),
          );
        }
      } catch (_e) {
        // Ignore telemetry errors to avoid infinite loops
      }
    }
  }
  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return _jsxs('div', {
        className: cn(
          'flex flex-col items-center justify-center p-6 space-y-4 bg-red-950/20 border border-red-500/30 rounded-xl',
          this.props.className,
        ),
        children: [
          _jsx('div', {
            className: 'p-3 bg-red-500/20 rounded-full',
            children: _jsx(AlertTriangle, {
              className: 'w-8 h-8 text-red-400',
            }),
          }),
          _jsxs('div', {
            className: 'text-center space-y-2 max-w-md',
            children: [
              _jsxs('h3', {
                className: 'text-lg font-semibold text-red-400',
                children: [
                  'Co\u015B posz\u0142o nie tak ',
                  this.props.name ? `w ${this.props.name}` : '',
                ],
              }),
              _jsx('p', {
                className:
                  'text-sm text-red-400/80 break-words font-mono bg-black/40 p-2 rounded',
                children: this.state.error?.message || 'Nieznany błąd',
              }),
            ],
          }),
          _jsxs(Button, {
            variant: 'ghost',
            onClick: this.handleReset,
            className: 'mt-4 text-red-400 hover:text-red-300',
            children: [
              _jsx(RefreshCcw, { className: 'w-4 h-4 mr-2' }),
              'Spr\u00F3buj ponownie',
            ],
          }),
        ],
      });
    }
    return this.props.children;
  }
}
