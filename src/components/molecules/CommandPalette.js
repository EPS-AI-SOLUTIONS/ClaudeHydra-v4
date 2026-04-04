// src/components/molecules/CommandPalette.tsx
/** Jaskier Shared Pattern */
/**
 * Command Palette (Ctrl+K)
 * ========================
 * Modal overlay with search input and action list.
 * Supports keyboard navigation (Arrow Up/Down + Enter).
 * Uses viewStore for navigation, ThemeContext for theme toggle.
 */
import { useFocusTrap } from '@jaskier/core';
import { cn } from '@jaskier/ui';
import { Home, MessageSquare, Moon, Plus, Search, Sun } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useSessionSync } from '@/features/chat/hooks/useSessionSync';
import { useViewStore } from '@/stores/viewStore';
export function CommandPalette() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const modalRef = useRef(null);
  const inputRef = useRef(null);
  const { resolvedTheme, toggleTheme } = useTheme();
  const setCurrentView = useViewStore((s) => s.setCurrentView);
  const toggleSidebar = useViewStore((s) => s.toggleSidebar);
  const { createSessionWithSync } = useSessionSync();
  const isLight = resolvedTheme === 'light';
  useFocusTrap(modalRef, {
    active: open,
    onEscape: () => setOpen(false),
  });
  const actions = useMemo(
    () => [
      {
        id: 'home',
        label: t('nav.home', 'Home'),
        icon: _jsx(Home, { size: 16 }),
        keywords: 'home start dashboard',
        handler: () => {
          setCurrentView('home');
          setOpen(false);
        },
      },
      {
        id: 'chat',
        label: t('nav.chat', 'Chat'),
        icon: _jsx(MessageSquare, { size: 16 }),
        keywords: 'chat message conversation',
        handler: () => {
          setCurrentView('chat');
          setOpen(false);
        },
      },
      {
        id: 'new-session',
        label: t('command.newChat', 'New Chat Session'),
        icon: _jsx(Plus, { size: 16 }),
        keywords: 'new chat session create',
        handler: () => {
          setCurrentView('chat');
          setOpen(false);
          createSessionWithSync();
        },
      },
      {
        id: 'toggle-sidebar',
        label: t('command.toggleSidebar', 'Toggle Sidebar'),
        icon: _jsx(MessageSquare, { size: 16 }),
        keywords: 'sidebar toggle collapse expand',
        handler: () => {
          toggleSidebar();
          setOpen(false);
        },
      },
      {
        id: 'theme',
        label: isLight ? t('command.darkMode', 'Switch to Dark Mode') : t('command.lightMode', 'Switch to Light Mode'),
        icon: isLight ? _jsx(Moon, { size: 16 }) : _jsx(Sun, { size: 16 }),
        keywords: 'theme dark light mode toggle',
        handler: () => {
          toggleTheme();
          setOpen(false);
        },
      },
    ],
    [t, setCurrentView, toggleSidebar, isLight, toggleTheme, createSessionWithSync],
  );
  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter((a) => a.label.toLowerCase().includes(q) || a.keywords.includes(q));
  }, [query, actions]);
  useEffect(() => {
    setActiveIndex(0);
  }, []);
  // Global Ctrl+K listener
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' && filtered[activeIndex]) {
        e.preventDefault();
        filtered[activeIndex].handler();
      }
    },
    [filtered, activeIndex],
  );
  if (!open) return null;
  return createPortal(
    _jsxs(_Fragment, {
      children: [
        _jsx('div', {
          className: 'fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]',
          onClick: () => setOpen(false),
          onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') setOpen(false);
          },
          role: 'presentation',
        }),
        _jsxs('div', {
          ref: modalRef,
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('command.title', 'Command Palette'),
          onKeyDown: handleKeyDown,
          className: cn(
            'fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-md z-[9999] rounded-xl border overflow-hidden shadow-2xl',
            isLight ? 'bg-white/95 border-slate-200' : 'bg-[#0a0e13]/95 border-white/10',
          ),
          children: [
            _jsxs('div', {
              className: cn(
                'flex items-center gap-3 px-4 py-3 border-b',
                isLight ? 'border-slate-200' : 'border-white/10',
              ),
              children: [
                _jsx(Search, { size: 16, className: isLight ? 'text-slate-400' : 'text-white/40' }),
                _jsx('input', {
                  ref: inputRef,
                  type: 'text',
                  value: query,
                  onChange: (e) => setQuery(e.target.value),
                  placeholder: t('command.placeholder', 'Type a command...'),
                  className: cn(
                    'flex-1 bg-transparent outline-none text-sm font-mono',
                    isLight ? 'text-slate-900 placeholder:text-slate-400' : 'text-white placeholder:text-white/40',
                  ),
                }),
                _jsx('kbd', {
                  className: cn(
                    'text-[10px] px-1.5 py-0.5 rounded border font-mono',
                    isLight ? 'border-slate-300 text-slate-400' : 'border-white/20 text-white/30',
                  ),
                  children: 'ESC',
                }),
              ],
            }),
            _jsxs('div', {
              className: 'max-h-64 overflow-y-auto py-1',
              role: 'listbox',
              children: [
                filtered.length === 0 &&
                  _jsx('p', {
                    className: cn('text-center text-sm py-4', isLight ? 'text-slate-400' : 'text-white/40'),
                    children: t('command.noResults', 'No results'),
                  }),
                filtered.map((action, idx) =>
                  _jsxs(
                    'button',
                    {
                      type: 'button',
                      role: 'option',
                      'aria-selected': idx === activeIndex,
                      onClick: action.handler,
                      onMouseEnter: () => setActiveIndex(idx),
                      className: cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left',
                        idx === activeIndex
                          ? isLight
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : 'bg-white/10 text-white'
                          : isLight
                            ? 'text-slate-700 hover:bg-slate-100'
                            : 'text-white/70 hover:bg-white/5',
                      ),
                      children: [
                        _jsx('span', { className: 'shrink-0', children: action.icon }),
                        _jsx('span', { className: 'font-mono', children: action.label }),
                      ],
                    },
                    action.id,
                  ),
                ),
              ],
            }),
            _jsxs('div', {
              className: cn(
                'flex items-center justify-between px-4 py-2 border-t text-[10px]',
                isLight ? 'border-slate-200 text-slate-400' : 'border-white/10 text-white/30',
              ),
              children: [
                _jsx('span', { children: 'Navigate with arrow keys' }),
                _jsx('span', { children: 'Ctrl+K to toggle' }),
              ],
            }),
          ],
        }),
      ],
    }),
    document.body,
  );
}
