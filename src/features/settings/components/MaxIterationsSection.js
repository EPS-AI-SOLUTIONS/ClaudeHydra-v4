/** Jaskier Shared Pattern — Max Iterations Settings Section */
import { useViewTheme } from '@jaskier/chat-module';
import { Button, cn } from '@jaskier/ui';
import { Minus, Plus, Repeat } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiPost } from '@/shared/api/client';
import { useSettingsQuery } from '@/shared/hooks/useSettings';

const MIN = 5;
const MAX = 50;
const STEP = 5;
export const MaxIterationsSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: settings, refetch } = useSettingsQuery();
  const [saving, setSaving] = useState(false);
  const current = settings?.max_iterations ?? 10;
  const save = useCallback(
    async (value) => {
      const clamped = Math.max(MIN, Math.min(MAX, value));
      setSaving(true);
      try {
        await apiPost('/api/settings', { ...settings, max_iterations: clamped });
        await refetch();
        toast.success(t('settings.maxIterations.saved', 'Max iterations updated'));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save');
      } finally {
        setSaving(false);
      }
    },
    [refetch, t, settings],
  );
  return _jsxs('div', {
    className: 'space-y-4',
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          _jsx(Repeat, { size: 18, className: 'text-[var(--matrix-accent)]' }),
          _jsx('h3', {
            className: cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text),
            children: t('settings.maxIterations.title', 'Agent Iterations'),
          }),
        ],
      }),
      _jsx('p', {
        className: cn('text-xs', theme.textMuted),
        children: t(
          'settings.maxIterations.description',
          'How many tool-call rounds the agent can perform per request. Higher values let agents complete complex tasks autonomously.',
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
            children: _jsx(Minus, { size: 14 }),
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
            children: _jsx(Plus, { size: 14 }),
          }),
          _jsx('span', {
            className: cn('text-lg font-mono font-bold min-w-[3ch] text-center', theme.text),
            children: current,
          }),
        ],
      }),
      _jsxs('div', {
        className: cn('flex justify-between text-[10px] font-mono px-1', theme.textMuted),
        children: [_jsxs('span', { children: [MIN, ' (fast)'] }), _jsxs('span', { children: [MAX, ' (autonomous)'] })],
      }),
    ],
  });
});
MaxIterationsSection.displayName = 'MaxIterationsSection';
