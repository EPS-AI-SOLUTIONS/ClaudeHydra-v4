// src/components/molecules/LanguageSwitcher.tsx
/** Jaskier Shared Pattern */
/**
 * Runtime Language Switcher
 * =========================
 * Compact inline language switcher using i18next.
 * Renders flag-style toggle buttons for EN/PL.
 */
import { cn } from '@jaskier/ui';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import Languages from '~icons/lucide/languages';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
];
export function LanguageSwitcher({ className }) {
  const { i18n } = useTranslation();
  return _jsxs('div', {
    className: cn('flex items-center gap-1', className),
    children: [
      _jsx(Languages, {
        className: 'w-3.5 h-3.5 text-[var(--matrix-text-dim)]',
      }),
      LANGUAGES.map((lang) =>
        _jsx(
          'button',
          {
            type: 'button',
            onClick: () => i18n.changeLanguage(lang.code),
            className: cn(
              'px-2 py-0.5 rounded text-xs transition-colors cursor-pointer',
              i18n.language === lang.code
                ? 'bg-[var(--matrix-accent)] text-[var(--matrix-bg-primary)] font-medium'
                : 'text-[var(--matrix-text-dim)] hover:text-[var(--matrix-text)]',
            ),
            'aria-label': `Switch language to ${lang.label}`,
            'aria-pressed': i18n.language === lang.code,
            children: lang.code.toUpperCase(),
          },
          lang.code,
        ),
      ),
    ],
  });
}
