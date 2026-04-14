/** Jaskier Shared Pattern — Completion Sound Settings */
import { useViewTheme } from '@jaskier/chat-module';
import {
  getCompletionVolume,
  isCompletionSoundEnabled,
  setCompletionSoundEnabled,
  setCompletionVolume,
} from '@jaskier/core';
import { cn } from '@jaskier/ui';
import { memo, useCallback, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import Bell from '~icons/lucide/bell';
import BellOff from '~icons/lucide/bell-off';
export const CompletionSoundSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const [enabled, setEnabled] = useState(isCompletionSoundEnabled);
  const [volume, setVolume] = useState(getCompletionVolume);
  const toggleSound = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    setCompletionSoundEnabled(next);
  }, [enabled]);
  const handleVolume = useCallback((e) => {
    const v = Number(e.target.value);
    setVolume(v);
    setCompletionVolume(v);
  }, []);
  return _jsxs('div', {
    className: 'space-y-4',
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          enabled
            ? _jsx(Bell, {
                width: 18,
                height: 18,
                className: 'text-[var(--matrix-accent)]',
              })
            : _jsx(BellOff, {
                width: 18,
                height: 18,
                className: 'text-[var(--matrix-accent)]',
              }),
          _jsx('h3', {
            className: cn(
              'text-sm font-semibold font-mono uppercase tracking-wider',
              theme.text,
            ),
            children: t('settings.completionSound.title', 'Completion Sound'),
          }),
        ],
      }),
      _jsx('p', {
        className: cn('text-xs', theme.textMuted),
        children: t(
          'settings.completionSound.description',
          'Play a chime and show a toast when the AI finishes generating a response.',
        ),
      }),
      _jsxs('div', {
        className: 'flex items-center gap-4',
        children: [
          _jsx('button', {
            type: 'button',
            onClick: toggleSound,
            className: cn(
              'relative w-11 h-6 rounded-full transition-colors shrink-0',
              enabled
                ? 'bg-[var(--matrix-accent)]'
                : 'bg-[var(--matrix-glass)]',
            ),
            role: 'switch',
            'aria-checked': enabled,
            'aria-label': t(
              'settings.completionSound.toggle',
              'Toggle completion sound',
            ),
            children: _jsx('span', {
              className: cn(
                'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                enabled && 'translate-x-5',
              ),
            }),
          }),
          enabled &&
            _jsx('input', {
              type: 'range',
              min: 0,
              max: 1,
              step: 0.05,
              value: volume,
              onChange: handleVolume,
              className:
                'flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-[var(--matrix-accent)] bg-[var(--matrix-glass)]',
              'aria-label': t('settings.completionSound.volume', 'Volume'),
            }),
          enabled &&
            _jsxs('span', {
              className: cn(
                'text-xs font-mono min-w-[3ch] text-right',
                theme.textMuted,
              ),
              children: [Math.round(volume * 100), '%'],
            }),
        ],
      }),
    ],
  });
});
CompletionSoundSection.displayName = 'CompletionSoundSection';
