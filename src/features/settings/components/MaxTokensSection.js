/** Jaskier Shared Pattern — Max Tokens Settings Section */
import { useViewTheme } from '@jaskier/chat-module';
import { Button, cn } from '@jaskier/ui';
import { memo, useCallback, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiPost } from '@/shared/api/client';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
import Minus from '~icons/lucide/minus';
import Plus from '~icons/lucide/plus';
import TextCursorInput from '~icons/lucide/text-cursor-input';

const MIN = 1024;
const MAX = 16384;
const STEP = 1024;
function formatTokens(n) {
  return n >= 1024 ? `${Math.round(n / 1024)}K` : String(n);
}
export const MaxTokensSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: settings, refetch } = useSettingsQuery();
  const [saving, setSaving] = useState(false);
  const current = settings?.max_tokens ?? 4096;
  const save = useCallback(
    async (value) => {
      const clamped = Math.max(MIN, Math.min(MAX, value));
      setSaving(true);
      try {
        await apiPost('/api/settings', {
          ...settings,
          max_tokens: clamped,
        });
        await refetch();
        toast.success(t('settings.maxTokens.saved', 'Max tokens updated'));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save');
      } finally {
        setSaving(false);
      }
    },
    [settings, refetch, t],
  );
  return _jsxs('div', {
    className: 'space-y-4',
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          _jsx(TextCursorInput, {
            width: 18,
            height: 18,
            className: 'text-[var(--matrix-accent)]',
          }),
          _jsx('h3', {
            className: cn(
              'text-sm font-semibold font-mono uppercase tracking-wider',
              theme.text,
            ),
            children: t('settings.maxTokens.title', 'Max Output Tokens'),
          }),
        ],
      }),
      _jsx('p', {
        className: cn('text-xs', theme.textMuted),
        children: t(
          'settings.maxTokens.description',
          'Maximum number of tokens the model can generate per response. Higher values allow longer, more detailed answers.',
        ),
      }),
      _jsxs('div', {
        className: 'flex items-center gap-3',
        children: [
          _jsx(Button, {
            variant: 'ghost',
            size: 'sm',
            onClick: () => save(current - STEP),
            disabled: saving || current <= MIN,
            'aria-label': 'Decrease',
            children: _jsx(Minus, { width: 14, height: 14 }),
          }),
          _jsx('input', {
            type: 'range',
            min: MIN,
            max: MAX,
            step: STEP,
            value: current,
            onChange: (e) => save(Number(e.target.value)),
            disabled: saving,
            className:
              'flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-[var(--matrix-accent)] bg-[var(--matrix-glass)]',
          }),
          _jsx(Button, {
            variant: 'ghost',
            size: 'sm',
            onClick: () => save(current + STEP),
            disabled: saving || current >= MAX,
            'aria-label': 'Increase',
            children: _jsx(Plus, { width: 14, height: 14 }),
          }),
          _jsx('span', {
            className: cn(
              'text-lg font-mono font-bold min-w-[4ch] text-center',
              theme.text,
            ),
            children: formatTokens(current),
          }),
        ],
      }),
      _jsxs('div', {
        className: cn(
          'flex justify-between text-[10px] font-mono px-1',
          theme.textMuted,
        ),
        children: [
          _jsxs('span', { children: [formatTokens(MIN), ' (short)'] }),
          _jsxs('span', { children: [formatTokens(MAX), ' (long)'] }),
        ],
      }),
    ],
  });
});
MaxTokensSection.displayName = 'MaxTokensSection';
