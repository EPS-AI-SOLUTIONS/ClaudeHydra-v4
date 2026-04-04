/** Jaskier Shared Pattern — Custom Instructions Settings Section */
import { useViewTheme } from '@jaskier/chat-module';
import { Button, cn } from '@jaskier/ui';
import { FileText } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiPost } from '@/shared/api/client';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
export const CustomInstructionsSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: settings, refetch } = useSettingsQuery();
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (settings?.custom_instructions != null) {
      setDraft(settings.custom_instructions);
    }
  }, [settings?.custom_instructions]);
  const save = useCallback(async () => {
    setSaving(true);
    try {
      await apiPost('/api/settings', { ...settings, custom_instructions: draft });
      await refetch();
      toast.success(t('settings.customInstructions.saved', 'Custom instructions saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [draft, refetch, settings, t]);
  const isDirty = draft !== (settings?.custom_instructions ?? '');
  return _jsxs('div', {
    className: 'space-y-4',
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          _jsx(FileText, { size: 18, className: 'text-[var(--matrix-accent)]' }),
          _jsx('h3', {
            className: cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text),
            children: t('settings.customInstructions.title', 'Custom Instructions'),
          }),
        ],
      }),
      _jsx('p', {
        className: cn('text-xs', theme.textMuted),
        children: t(
          'settings.customInstructions.description',
          'Additional instructions injected into every system prompt. Use this to customize agent behavior globally.',
        ),
      }),
      _jsx('textarea', {
        value: draft,
        onChange: (e) => setDraft(e.target.value),
        rows: 4,
        placeholder: t('settings.customInstructions.placeholder', 'e.g., Always respond in Polish...'),
        className: cn(
          'w-full rounded-lg border px-3 py-2 text-sm font-mono resize-y',
          'bg-[var(--matrix-glass)] border-[var(--matrix-border)]',
          'focus:outline-none focus:ring-1 focus:ring-[var(--matrix-accent)]',
          theme.text,
        ),
      }),
      isDirty &&
        _jsx(Button, {
          variant: 'ghost',
          size: 'sm',
          onClick: save,
          disabled: saving,
          children: saving
            ? t('common.saving', 'Saving...')
            : t('settings.customInstructions.save', 'Save Instructions'),
        }),
    ],
  });
});
CustomInstructionsSection.displayName = 'CustomInstructionsSection';
