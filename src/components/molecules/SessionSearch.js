/**
 * SessionSearch — Debounced search input for filtering chat sessions in the sidebar.
 *
 * #19 - Session search/filter
 */
import { cn } from '@jaskier/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import Search from '~icons/lucide/search';
import X from '~icons/lucide/x';
export function SessionSearch({ onSearch, className }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const debounceRef = useRef(undefined);
  // Debounced callback (300ms)
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      onSearch(value.trim().toLowerCase());
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [value, onSearch]);
  const handleClear = useCallback(() => {
    setValue('');
    onSearch('');
  }, [onSearch]);
  return _jsxs('div', {
    className: cn('relative flex items-center', className),
    children: [
      _jsx(Search, {
        width: 13,
        height: 13,
        className:
          'absolute left-2.5 text-[var(--matrix-text-secondary)]/60 pointer-events-none',
      }),
      _jsx('input', {
        type: 'text',
        value: value,
        onChange: (e) => setValue(e.target.value),
        placeholder: t('sidebar.searchSessions', 'Search chats...'),
        'aria-label': t('sidebar.searchSessions', 'Search chats...'),
        className: cn(
          'w-full pl-8 pr-7 py-1.5 text-xs rounded-lg',
          'bg-[var(--matrix-bg-primary)]/50 border border-[var(--matrix-border)]',
          'text-[var(--matrix-text-primary)] placeholder:text-[var(--matrix-text-secondary)]/40',
          'focus:outline-none focus:border-[var(--matrix-accent)]/40',
          'transition-colors font-mono',
        ),
      }),
      value &&
        _jsx('button', {
          type: 'button',
          onClick: handleClear,
          className:
            'absolute right-2 p-0.5 rounded text-[var(--matrix-text-secondary)]/60 hover:text-[var(--matrix-text-primary)] transition-colors',
          'aria-label': t('common.clear', 'Clear'),
          children: _jsx(X, { width: 12, height: 12 }),
        }),
    ],
  });
}
