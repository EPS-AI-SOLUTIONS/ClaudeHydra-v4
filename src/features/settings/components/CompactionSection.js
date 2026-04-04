/** Jaskier Shared Pattern — Message Compaction Settings Section */
import { useViewTheme } from '@jaskier/chat-module';
import { Button, cn } from '@jaskier/ui';
import { Minus, PackageOpen, Plus } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiPost } from '@/shared/api/client';
import { useSettingsQuery } from '@/shared/hooks/useSettings';

const THRESHOLD_MIN = 10;
const THRESHOLD_MAX = 100;
const THRESHOLD_STEP = 5;
const KEEP_MIN = 5;
const KEEP_MAX = 50;
const KEEP_STEP = 5;
export const CompactionSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: settings, refetch } = useSettingsQuery();
  const [saving, setSaving] = useState(false);
  const threshold = settings?.compaction_threshold ?? 25;
  const keep = settings?.compaction_keep ?? 15;
  const save = useCallback(
    async (newThreshold, newKeep) => {
      const clampedThreshold = Math.max(THRESHOLD_MIN, Math.min(THRESHOLD_MAX, newThreshold));
      // Ensure keep < threshold
      const maxKeep = Math.min(KEEP_MAX, clampedThreshold - 1);
      const clampedKeep = Math.max(KEEP_MIN, Math.min(maxKeep, newKeep));
      setSaving(true);
      try {
        await apiPost('/api/settings', {
          ...settings,
          compaction_threshold: clampedThreshold,
          compaction_keep: clampedKeep,
        });
        await refetch();
        toast.success(t('settings.compaction.saved', 'Compaction settings updated'));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save');
      } finally {
        setSaving(false);
      }
    },
    [refetch, t, settings],
  );
  return _jsxs('div', {
    className: 'space-y-5',
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          _jsx(PackageOpen, { size: 18, className: 'text-[var(--matrix-accent)]' }),
          _jsx('h3', {
            className: cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text),
            children: t('settings.compaction.title', 'Message Compaction'),
          }),
        ],
      }),
      _jsx('p', {
        className: cn('text-xs', theme.textMuted),
        children: t(
          'settings.compaction.description',
          'Automatically compress older messages to save tokens and memory. When the message count exceeds the threshold, only the most recent messages are kept in the active context.',
        ),
      }),
      _jsxs('div', {
        className: 'space-y-2',
        children: [
          _jsx('span', {
            className: cn('text-xs font-mono font-semibold', theme.text),
            children: t('settings.compaction.threshold', 'Compress after N messages'),
          }),
          _jsxs('div', {
            className: 'flex items-center gap-3',
            children: [
              _jsx(Button, {
                variant: 'ghost',
                size: 'sm',
                onClick: () => save(threshold - THRESHOLD_STEP, keep),
                disabled: saving || threshold <= THRESHOLD_MIN,
                'aria-label': 'Decrease threshold',
                children: _jsx(Minus, { size: 14 }),
              }),
              _jsx('input', {
                type: 'range',
                min: THRESHOLD_MIN,
                max: THRESHOLD_MAX,
                step: THRESHOLD_STEP,
                value: threshold,
                onChange: (e) => save(Number(e.target.value), keep),
                disabled: saving,
                className:
                  'flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-[var(--matrix-accent)] bg-[var(--matrix-glass)]',
                'aria-label': t('settings.compaction.threshold', 'Compress after N messages'),
                'aria-valuemin': THRESHOLD_MIN,
                'aria-valuemax': THRESHOLD_MAX,
                'aria-valuenow': threshold,
              }),
              _jsx(Button, {
                variant: 'ghost',
                size: 'sm',
                onClick: () => save(threshold + THRESHOLD_STEP, keep),
                disabled: saving || threshold >= THRESHOLD_MAX,
                'aria-label': 'Increase threshold',
                children: _jsx(Plus, { size: 14 }),
              }),
              _jsx('span', {
                className: cn('text-lg font-mono font-bold min-w-[3ch] text-center', theme.text),
                children: threshold,
              }),
            ],
          }),
          _jsxs('div', {
            className: cn('flex justify-between text-[10px] font-mono px-1', theme.textMuted),
            children: [
              _jsxs('span', { children: [THRESHOLD_MIN, ' (aggressive)'] }),
              _jsxs('span', { children: [THRESHOLD_MAX, ' (relaxed)'] }),
            ],
          }),
        ],
      }),
      _jsxs('div', {
        className: 'space-y-2',
        children: [
          _jsx('span', {
            className: cn('text-xs font-mono font-semibold', theme.text),
            children: t('settings.compaction.keep', 'Keep last N messages'),
          }),
          _jsxs('div', {
            className: 'flex items-center gap-3',
            children: [
              _jsx(Button, {
                variant: 'ghost',
                size: 'sm',
                onClick: () => save(threshold, keep - KEEP_STEP),
                disabled: saving || keep <= KEEP_MIN,
                'aria-label': 'Decrease keep',
                children: _jsx(Minus, { size: 14 }),
              }),
              _jsx('input', {
                type: 'range',
                min: KEEP_MIN,
                max: Math.min(KEEP_MAX, threshold - 1),
                step: KEEP_STEP,
                value: keep,
                onChange: (e) => save(threshold, Number(e.target.value)),
                disabled: saving,
                className:
                  'flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-[var(--matrix-accent)] bg-[var(--matrix-glass)]',
                'aria-label': t('settings.compaction.keep', 'Keep last N messages'),
                'aria-valuemin': KEEP_MIN,
                'aria-valuemax': Math.min(KEEP_MAX, threshold - 1),
                'aria-valuenow': keep,
              }),
              _jsx(Button, {
                variant: 'ghost',
                size: 'sm',
                onClick: () => save(threshold, keep + KEEP_STEP),
                disabled: saving || keep >= Math.min(KEEP_MAX, threshold - 1),
                'aria-label': 'Increase keep',
                children: _jsx(Plus, { size: 14 }),
              }),
              _jsx('span', {
                className: cn('text-lg font-mono font-bold min-w-[3ch] text-center', theme.text),
                children: keep,
              }),
            ],
          }),
          _jsxs('div', {
            className: cn('flex justify-between text-[10px] font-mono px-1', theme.textMuted),
            children: [
              _jsxs('span', { children: [KEEP_MIN, ' (minimal)'] }),
              _jsxs('span', { children: [Math.min(KEEP_MAX, threshold - 1), ' (max)'] }),
            ],
          }),
        ],
      }),
    ],
  });
});
CompactionSection.displayName = 'CompactionSection';
