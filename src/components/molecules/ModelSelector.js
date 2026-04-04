// src/components/molecules/ModelSelector.tsx
/**
 * ModelSelector Molecule
 * ======================
 * Glass-styled dropdown for AI model selection.
 * Features: search/filter, keyboard navigation, outside-click close.
 * Generic typing for model options.
 *
 * ClaudeHydra: Green Matrix accent with glass-panel from globals.css.
 */
import { useDebounce } from '@jaskier/core';
import { cn } from '@jaskier/ui';
import { Check, ChevronDown, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ModelSelector({
  models,
  selectedId,
  onSelect,
  placeholder = 'Select model',
  disabled = false,
  className,
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusIndex, setFocusIndex] = useState(-1);
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  // ----- Derived data --------------------------------------------------
  const debouncedSearch = useDebounce(search, 300);
  const selectedModel = useMemo(() => models.find((m) => m.id === selectedId) ?? null, [models, selectedId]);
  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return models;
    const q = debouncedSearch.toLowerCase();
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.provider?.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q),
    );
  }, [models, debouncedSearch]);
  // ----- Outside click -------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);
  // ----- Auto-focus search on open -------------------------------------
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setFocusIndex(-1);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [isOpen]);
  // ----- Scroll focused item into view ---------------------------------
  useEffect(() => {
    if (focusIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-model-item]');
    items[focusIndex]?.scrollIntoView({ block: 'nearest' });
  }, [focusIndex]);
  // ----- Keyboard nav --------------------------------------------------
  const handleKeyDown = useCallback(
    (e) => {
      if (!isOpen) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusIndex((i) => (i + 1) % filtered.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusIndex((i) => (i - 1 + filtered.length) % filtered.length);
          break;
        case 'Enter': {
          e.preventDefault();
          const target = filtered[focusIndex];
          if (target && target.available !== false) {
            onSelect(target);
            setIsOpen(false);
          }
          break;
        }
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
        default:
          break;
      }
    },
    [isOpen, filtered, focusIndex, onSelect],
  );
  // ----- Select handler ------------------------------------------------
  const handleSelect = useCallback(
    (model) => {
      if (model.available === false) return;
      onSelect(model);
      setIsOpen(false);
    },
    [onSelect],
  );
  // ----- Render --------------------------------------------------------
  return _jsxs('div', {
    ref: rootRef,
    className: cn('relative', className),
    onKeyDown: handleKeyDown,
    role: 'combobox',
    'aria-expanded': isOpen,
    tabIndex: -1,
    children: [
      _jsxs('button', {
        type: 'button',
        onClick: () => !disabled && setIsOpen((o) => !o),
        disabled: disabled,
        'aria-haspopup': 'listbox',
        className: cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all w-full',
          'bg-[var(--glass-bg)] border border-[var(--glass-border)]',
          'hover:border-[var(--matrix-accent-dim)] hover:bg-[var(--matrix-bg-tertiary)]',
          isOpen && 'border-[var(--matrix-accent)] ring-1 ring-[var(--matrix-accent)]/30',
          disabled && 'opacity-50 cursor-not-allowed',
        ),
        children: [
          selectedModel?.icon && _jsx('span', { className: 'shrink-0', children: selectedModel.icon }),
          _jsx('span', {
            className: 'text-[var(--matrix-text-primary)] font-medium truncate flex-1 text-left',
            children: selectedModel?.name ?? placeholder,
          }),
          _jsx(ChevronDown, {
            size: 16,
            className: cn(
              'text-[var(--matrix-text-secondary)] transition-transform shrink-0',
              isOpen && 'rotate-180',
            ),
          }),
        ],
      }),
      _jsx(AnimatePresence, {
        children:
          isOpen &&
          _jsxs(motion.div, {
            initial: { opacity: 0, y: -8, scale: 0.96 },
            animate: { opacity: 1, y: 0, scale: 1 },
            exit: { opacity: 0, y: -8, scale: 0.96 },
            transition: { duration: 0.15 },
            className: cn('absolute z-50 mt-2 w-full min-w-[280px]', 'glass-panel overflow-hidden'),
            role: 'listbox',
            children: [
              models.length > 5 &&
                _jsxs('div', {
                  className: 'flex items-center gap-2 px-3 py-2 border-b border-[var(--glass-border)]',
                  children: [
                    _jsx(Search, { size: 14, className: 'text-[var(--matrix-text-secondary)] shrink-0' }),
                    _jsx('input', {
                      ref: searchRef,
                      type: 'text',
                      value: search,
                      onChange: (e) => {
                        setSearch(e.target.value);
                        setFocusIndex(-1);
                      },
                      placeholder: t('models.searchModels', 'Search models...'),
                      className:
                        'bg-transparent text-sm text-[var(--matrix-text-primary)] placeholder:text-[var(--matrix-text-secondary)] outline-none w-full font-mono',
                    }),
                  ],
                }),
              _jsxs('div', {
                ref: listRef,
                className: 'max-h-64 overflow-y-auto p-1',
                children: [
                  filtered.length === 0 &&
                    _jsx('div', {
                      className: 'px-3 py-4 text-center text-sm text-[var(--matrix-text-secondary)] font-mono',
                      children: 'No models found',
                    }),
                  filtered.map((model, idx) => {
                    const isSelected = model.id === selectedId;
                    const isFocused = idx === focusIndex;
                    const isDisabled = model.available === false;
                    return _jsxs(
                      'button',
                      {
                        type: 'button',
                        'data-model-item': true,
                        role: 'option',
                        'aria-selected': isSelected,
                        disabled: isDisabled,
                        onClick: () => handleSelect(model),
                        onMouseEnter: () => setFocusIndex(idx),
                        className: cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg',
                          'transition-colors text-left text-sm',
                          isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                          !isDisabled && (isFocused || isSelected) && 'bg-[var(--matrix-accent)]/10',
                          isSelected && 'border border-[var(--matrix-accent)]/30',
                          !isSelected && 'border border-transparent',
                        ),
                        children: [
                          _jsx('span', {
                            className: 'w-4 h-4 flex items-center justify-center shrink-0',
                            children: isSelected
                              ? _jsx(Check, { size: 14, className: 'text-[var(--matrix-accent)]' })
                              : (model.icon ?? null),
                          }),
                          _jsxs('span', {
                            className: 'flex-1 min-w-0',
                            children: [
                              _jsx('span', {
                                className: 'block font-medium text-[var(--matrix-text-primary)] truncate',
                                children: model.name,
                              }),
                              model.description &&
                                _jsx('span', {
                                  className: 'block text-xs text-[var(--matrix-text-secondary)] truncate mt-0.5',
                                  children: model.description,
                                }),
                            ],
                          }),
                          model.provider &&
                            _jsx('span', {
                              className: 'badge badge-default text-[10px] font-mono uppercase shrink-0',
                              children: model.provider,
                            }),
                        ],
                      },
                      model.id,
                    );
                  }),
                ],
              }),
            ],
          }),
      }),
    ],
  });
}
