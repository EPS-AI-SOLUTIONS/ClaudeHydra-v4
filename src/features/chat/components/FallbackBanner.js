import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
/**
 * FallbackBanner — Amber notification when the backend falls back to a lighter model.
 *
 * Shows the original and fallback model names with a reason.
 * Auto-dismisses after 10 seconds or can be closed manually.
 */
import AlertTriangle from '~icons/lucide/alert-triangle';
import X from '~icons/lucide/x';

const REASON_LABELS = {
  rate_limited: 'limit zapytań',
  server_error: 'błąd serwera',
};
export function FallbackBanner({ data, onDismiss }) {
  const timerRef = useRef(null);
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  useEffect(() => {
    if (data) {
      clearTimer();
      timerRef.current = setTimeout(() => {
        onDismiss();
      }, 10_000);
    }
    return clearTimer;
  }, [data, onDismiss, clearTimer]);
  return _jsx(AnimatePresence, {
    children:
      data &&
      _jsx(motion.div, {
        initial: { opacity: 0, y: -20, height: 0 },
        animate: { opacity: 1, y: 0, height: 'auto' },
        exit: { opacity: 0, y: -20, height: 0 },
        transition: { duration: 0.3, ease: 'easeOut' },
        className: 'overflow-hidden',
        children: _jsxs('div', {
          className:
            'flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 text-sm font-mono mb-2',
          children: [
            _jsx(AlertTriangle, {
              width: 16,
              height: 16,
              className: 'text-amber-400 shrink-0',
            }),
            _jsxs('span', {
              className: 'flex-1',
              children: [
                'Prze\u0142\u0105czono z ',
                _jsx('strong', { children: data.from }),
                ' na',
                ' ',
                _jsx('strong', { children: data.to }),
                ' — ',
                REASON_LABELS[data.reason] ?? data.reason,
              ],
            }),
            _jsx('button', {
              type: 'button',
              onClick: onDismiss,
              className:
                'p-0.5 rounded hover:bg-amber-500/20 transition-colors shrink-0',
              'aria-label': 'Zamknij',
              children: _jsx(X, { width: 14, height: 14 }),
            }),
          ],
        }),
      }),
  });
}
