/** Jaskier Shared Pattern — OAuth startup suggestion banner */
import { useViewTheme } from '@jaskier/chat-module';
import { Button, cn } from '@jaskier/ui';
import { AnimatePresence, motion } from 'motion/react';
import { memo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { useOAuthStatus } from '@/shared/hooks/useOAuthStatus';
import { useViewStore } from '@/stores/viewStore';
import ArrowRight from '~icons/lucide/arrow-right';
import Crown from '~icons/lucide/crown';
import Key from '~icons/lucide/key';
import X from '~icons/lucide/x';
export const OAuthBanner = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { status, isLoading, isDismissed, dismiss } = useOAuthStatus();
  const setCurrentView = useViewStore((s) => s.setCurrentView);
  const visible = !isLoading && !status?.authenticated && !isDismissed;
  return _jsx(AnimatePresence, {
    children:
      visible &&
      _jsx(motion.div, {
        className: 'w-full max-w-lg mt-6',
        initial: { opacity: 0, y: -12, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -12, scale: 0.97 },
        transition: { duration: 0.3, ease: 'easeOut' },
        children: _jsxs('div', {
          className: cn(
            'relative rounded-2xl p-5',
            'border border-[var(--matrix-accent)]/20',
            'bg-[var(--matrix-accent)]/5',
            theme.card,
          ),
          children: [
            _jsx('button', {
              type: 'button',
              onClick: dismiss,
              className: cn(
                'absolute top-3 right-3 p-1 rounded-lg',
                'transition-colors hover:bg-white/10',
                theme.textMuted,
              ),
              'aria-label': t('common.close', 'Close'),
              children: _jsx(X, { width: 14, height: 14 }),
            }),
            _jsxs('div', {
              className: 'flex items-start gap-4',
              children: [
                _jsx('div', {
                  className:
                    'shrink-0 p-2.5 rounded-xl bg-[var(--matrix-accent)]/10',
                  children: _jsx(Crown, {
                    width: 20,
                    height: 20,
                    className: 'text-[var(--matrix-accent)]',
                  }),
                }),
                _jsxs('div', {
                  className: 'flex-1 min-w-0',
                  children: [
                    _jsx('h3', {
                      className: cn(
                        'text-sm font-semibold font-mono',
                        theme.text,
                      ),
                      children: t('oauth.bannerTitle'),
                    }),
                    _jsx('p', {
                      className: cn('text-xs mt-1', theme.textMuted),
                      children: t('oauth.bannerDesc'),
                    }),
                    _jsxs('div', {
                      className: 'flex gap-2 mt-3 flex-wrap',
                      children: [
                        _jsx(Button, {
                          variant: 'primary',
                          size: 'sm',
                          rightIcon: _jsx(ArrowRight, {
                            width: 13,
                            height: 13,
                          }),
                          onClick: () => setCurrentView('settings'),
                          children: t('oauth.setupOAuth'),
                        }),
                        _jsx(Button, {
                          variant: 'ghost',
                          size: 'sm',
                          leftIcon: _jsx(Key, { width: 13, height: 13 }),
                          onClick: dismiss,
                          children: t('oauth.useApiKey'),
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      }),
  });
});
OAuthBanner.displayName = 'OAuthBanner';
