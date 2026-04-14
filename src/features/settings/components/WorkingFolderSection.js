/** Jaskier Shared Pattern — Working Folder Settings Section */
import { useViewTheme } from '@jaskier/chat-module';
import { Button, cn, Input } from '@jaskier/ui';
import { memo, useCallback, useEffect, useState } from 'react';
import {
  Fragment as _Fragment,
  jsx as _jsx,
  jsxs as _jsxs,
} from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiPost } from '@/shared/api/client';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
import AlertCircle from '~icons/lucide/alert-circle';
import Check from '~icons/lucide/check';
import FolderOpen from '~icons/lucide/folder-open';
import Loader2 from '~icons/lucide/loader-2';
import Pencil from '~icons/lucide/pencil';
import X from '~icons/lucide/x';
export const WorkingFolderSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: settings, refetch } = useSettingsQuery();
  const [editing, setEditing] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (settings?.working_directory !== undefined) {
      setValue(settings.working_directory);
    }
  }, [settings?.working_directory]);
  const saveFolder = useCallback(
    async (path) => {
      if (!settings) return;
      setSaving(true);
      setError('');
      try {
        await apiPost('/api/settings', {
          ...settings,
          working_directory: path,
        });
        await refetch();
        setValue(path);
        setEditing(false);
        toast.success(
          path
            ? t('settings.workingFolder.saved', 'Working folder saved')
            : t('settings.workingFolder.cleared', 'Working folder cleared'),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save';
        setError(msg);
        toast.error(msg);
      } finally {
        setSaving(false);
      }
    },
    [settings, refetch, t],
  );
  const handleBrowse = useCallback(async () => {
    setBrowsing(true);
    try {
      const res = await apiPost('/api/files/browse', {
        initial_path: settings?.working_directory || '',
      });
      if (res.error) {
        toast.error(res.error);
      } else if (res.path && !res.cancelled) {
        saveFolder(res.path);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to open folder dialog',
      );
    } finally {
      setBrowsing(false);
    }
  }, [settings?.working_directory, saveFolder]);
  const handleSave = useCallback(
    () => saveFolder(value.trim()),
    [value, saveFolder],
  );
  const handleClear = useCallback(() => saveFolder(''), [saveFolder]);
  const handleCancel = useCallback(() => {
    setValue(settings?.working_directory ?? '');
    setEditing(false);
    setError('');
  }, [settings?.working_directory]);
  const currentFolder = settings?.working_directory;
  return _jsxs('div', {
    className: 'space-y-4',
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          _jsx(FolderOpen, {
            width: 18,
            height: 18,
            className: 'text-[var(--matrix-accent)]',
          }),
          _jsx('h3', {
            className: cn(
              'text-sm font-semibold font-mono uppercase tracking-wider',
              theme.text,
            ),
            children: t('settings.workingFolder.title', 'Working Folder'),
          }),
        ],
      }),
      _jsx('p', {
        className: cn('text-xs', theme.textMuted),
        children: t(
          'settings.workingFolder.description',
          'Set a default working directory so agents can use relative paths instead of absolute ones.',
        ),
      }),
      editing
        ? _jsxs('div', {
            className: 'space-y-3',
            children: [
              _jsx(Input, {
                value: value,
                onChange: (e) => {
                  setValue(e.target.value);
                  setError('');
                },
                placeholder: 'C:\\Users\\you\\project',
                onKeyDown: (e) => e.key === 'Enter' && handleSave(),
              }),
              error &&
                _jsxs('div', {
                  className: 'flex items-center gap-2 text-red-400',
                  children: [
                    _jsx(AlertCircle, { width: 14, height: 14 }),
                    _jsx('span', { className: 'text-xs', children: error }),
                  ],
                }),
              _jsxs('div', {
                className: 'flex gap-2',
                children: [
                  _jsx(Button, {
                    variant: 'primary',
                    size: 'sm',
                    leftIcon: _jsx(Check, { width: 14, height: 14 }),
                    onClick: handleSave,
                    isLoading: saving,
                    children: t('common.save', 'Save'),
                  }),
                  _jsx(Button, {
                    variant: 'ghost',
                    size: 'sm',
                    leftIcon: _jsx(X, { width: 14, height: 14 }),
                    onClick: handleCancel,
                    disabled: saving,
                    children: t('common.cancel', 'Cancel'),
                  }),
                ],
              }),
            ],
          })
        : _jsxs('div', {
            className: 'space-y-3',
            children: [
              currentFolder
                ? _jsx('div', {
                    className: cn(
                      'text-sm font-mono px-3 py-2 rounded-lg bg-[var(--matrix-glass)]',
                      theme.text,
                    ),
                    children: currentFolder,
                  })
                : _jsx('p', {
                    className: cn('text-xs italic', theme.textMuted),
                    children: t(
                      'settings.workingFolder.notSet',
                      'Not set — agents will require absolute paths',
                    ),
                  }),
              _jsxs('div', {
                className: 'flex gap-2',
                children: [
                  _jsx(Button, {
                    variant: 'primary',
                    size: 'sm',
                    leftIcon: browsing
                      ? _jsx(Loader2, {
                          width: 14,
                          height: 14,
                          className: 'animate-spin',
                        })
                      : _jsx(FolderOpen, { width: 14, height: 14 }),
                    onClick: handleBrowse,
                    disabled: browsing || saving,
                    children: browsing
                      ? t('settings.workingFolder.opening', 'Opening…')
                      : currentFolder
                        ? t('settings.workingFolder.change', 'Change')
                        : t('settings.workingFolder.set', 'Set Folder'),
                  }),
                  currentFolder &&
                    _jsxs(_Fragment, {
                      children: [
                        _jsx(Button, {
                          variant: 'ghost',
                          size: 'sm',
                          leftIcon: _jsx(Pencil, { width: 14, height: 14 }),
                          onClick: () => setEditing(true),
                          disabled: browsing || saving,
                          children: t(
                            'settings.workingFolder.editManually',
                            'Edit',
                          ),
                        }),
                        _jsx(Button, {
                          variant: 'danger',
                          size: 'sm',
                          leftIcon: _jsx(X, { width: 14, height: 14 }),
                          onClick: handleClear,
                          isLoading: saving,
                          children: t('settings.workingFolder.clear', 'Clear'),
                        }),
                      ],
                    }),
                ],
              }),
            ],
          }),
    ],
  });
});
WorkingFolderSection.displayName = 'WorkingFolderSection';
