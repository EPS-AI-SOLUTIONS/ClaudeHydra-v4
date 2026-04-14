/** Jaskier Shared Pattern — Telemetry Settings Section */
import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { memo, useCallback, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiPost } from '@/shared/api/client';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
import BarChart3 from '~icons/lucide/bar-chart-3';
export const TelemetrySection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: settings, refetch } = useSettingsQuery();
  const [saving, setSaving] = useState(false);
  const enabled = settings?.telemetry ?? false;
  const toggle = useCallback(async () => {
    setSaving(true);
    try {
      await apiPost('/api/settings', {
        ...settings,
        telemetry: !enabled,
      });
      await refetch();
      toast.success(t('settings.telemetry.saved', 'Telemetry setting saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [enabled, refetch, settings, t]);
  return _jsxs('div', {
    className: 'space-y-4',
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          _jsx(BarChart3, {
            width: 18,
            height: 18,
            className: 'text-[var(--matrix-accent)]',
          }),
          _jsx('h3', {
            className: cn(
              'text-sm font-semibold font-mono uppercase tracking-wider',
              theme.text,
            ),
            children: t('settings.telemetry.title', 'Telemetry'),
          }),
        ],
      }),
      _jsx('p', {
        className: cn('text-xs', theme.textMuted),
        children: t(
          'settings.telemetry.description',
          'Send anonymous error reports to help improve the application. No personal data is collected.',
        ),
      }),
      _jsxs('div', {
        className: 'flex items-center gap-3',
        children: [
          _jsx('button', {
            type: 'button',
            onClick: toggle,
            disabled: saving,
            className: cn(
              'relative w-11 h-6 rounded-full transition-colors shrink-0',
              enabled
                ? 'bg-[var(--matrix-accent)]'
                : 'bg-[var(--matrix-glass)]',
            ),
            role: 'switch',
            'aria-checked': enabled,
            'aria-label': t('settings.telemetry.toggle', 'Toggle telemetry'),
            children: _jsx('span', {
              className: cn(
                'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                enabled && 'translate-x-5',
              ),
            }),
          }),
          _jsx('span', {
            className: cn('text-sm font-mono', theme.textMuted),
            children: enabled
              ? t('settings.telemetry.enabled', 'Enabled')
              : t('settings.telemetry.disabled', 'Disabled'),
          }),
        ],
      }),
    ],
  });
});
TelemetrySection.displayName = 'TelemetrySection';
