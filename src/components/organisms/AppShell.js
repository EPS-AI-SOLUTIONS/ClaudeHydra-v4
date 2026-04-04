/**
 * AppShell — root layout organism for ClaudeHydra v4.
 * Ported from ClaudeHydra v3 App.tsx layout.
 *
 * Composes:
 *  - ThemeProvider wrapper
 *  - Background layers (RuneRain, background image, gradient, glow)
 *  - Sidebar (collapsible navigation)
 *  - TabBar (browser-style chat tabs, shown only in chat view)
 *  - Content area (children slot)
 *  - StatusFooter (with live system stats)
 *
 * Unified with GeminiHydra AppShell pattern for StatusFooter props.
 */
import { ChatViewThemeProvider } from '@jaskier/chat-module';
import { cn, RuneRain, ThemedBackground } from '@jaskier/ui';
import { useCallback, useEffect, useMemo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { CommandPalette } from '@/components/molecules/CommandPalette';
import { Sidebar } from '@/components/organisms/Sidebar';
import { StatusFooter } from '@/components/organisms/StatusFooter';
import { TabBar } from '@/components/organisms/TabBar';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { useSessionSync } from '@/features/chat/hooks/useSessionSync';
import { useHealthStatus, useSystemStatsQuery } from '@/features/health/hooks/useHealth';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
import { useViewStore } from '@/stores/viewStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const HEALTH_TO_CONNECTION = { healthy: 'connected', degraded: 'degraded', offline: 'disconnected' };
/** Format raw model ID (e.g. "claude-sonnet-4-6") into a display name ("Claude Sonnet 4"). */
function formatModelName(id) {
  // Strip common suffixes like date stamps (e.g. -20251001)
  const name = id
    .replace(/-\d{8}$/, '')
    .replace(/-preview$/, '')
    .replace(/-latest$/, '');
  const parts = name.split('-');
  return parts.map((p) => (/^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}
// ---------------------------------------------------------------------------
// Inner shell (needs ThemeProvider above it)
// ---------------------------------------------------------------------------
function AppShellInner({ children }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const currentView = useViewStore((s) => s.currentView);
  const { i18n } = useTranslation();
  // Sync <html lang="..."> with i18next language (accessibility: WCAG 3.1.1)
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    const handleLanguageChanged = (lng) => {
      document.documentElement.lang = lng;
    };
    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [i18n]);
  // Health & system stats
  const healthStatus = useHealthStatus();
  const { data: stats } = useSystemStatsQuery(healthStatus !== 'offline');
  const { data: settings } = useSettingsQuery();
  // Map health status to ConnectionHealth
  const connectionHealth = HEALTH_TO_CONNECTION[healthStatus];
  // Resolve display model from settings
  const displayModel = useMemo(() => {
    const raw = settings?.default_model;
    return raw ? formatModelName(raw) : undefined;
  }, [settings?.default_model]);
  // Build live footer props from system stats
  const raw = stats;
  const footerProps = useMemo(
    () => ({
      connectionHealth,
      ...(displayModel && { selectedModel: displayModel }),
      ...(raw && {
        cpuUsage: Math.round(raw['cpu_usage_percent'] ?? raw['cpu_usage'] ?? 0),
        ramUsage: Math.round(
          ((raw['memory_used_mb'] ?? raw['memory_used'] ?? 0) / (raw['memory_total_mb'] ?? raw['memory_total'] ?? 1)) *
            100,
        ),
        statsLoaded: true,
      }),
    }),
    [connectionHealth, displayModel, raw],
  );
  const glassPanel = cn(
    'backdrop-blur-xl border rounded-2xl',
    isDark ? 'bg-black/40 border-white/10 shadow-2xl' : 'bg-white/40 border-white/20 shadow-lg',
  );
  const { createSessionWithSync } = useSessionSync();
  // Ctrl+T: create new tab (chat view only)
  const handleKeyDown = useCallback(
    (e) => {
      if (e.ctrlKey && e.key === 't' && useViewStore.getState().currentView === 'chat') {
        e.preventDefault();
        createSessionWithSync();
      }
    },
    [createSessionWithSync],
  );
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
  const isLight = resolvedTheme === 'light';
  return _jsx(ChatViewThemeProvider, {
    isLight: isLight,
    children: _jsxs('div', {
      'data-testid': 'app-shell',
      className: cn(
        'relative flex h-screen w-full overflow-hidden font-mono',
        isDark
          ? 'text-white selection:bg-white/30 selection:text-white'
          : 'text-black selection:bg-emerald-500 selection:text-white',
      ),
      children: [
        _jsx('a', {
          href: '#main-content',
          className:
            'sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-matrix-accent focus:text-white',
          children: 'Skip to content',
        }),
        _jsx(ThemedBackground, { resolvedTheme: resolvedTheme }),
        _jsx(RuneRain, { opacity: 0.1 }),
        _jsx(CommandPalette, {}),
        _jsxs('div', {
          className: 'relative z-10 flex h-full w-full backdrop-blur-[1px] gap-4 p-4',
          children: [
            _jsx(Sidebar, {}),
            _jsxs('main', {
              id: 'main-content',
              className: cn('flex-1 flex flex-col min-w-0 overflow-hidden relative', glassPanel),
              children: [
                currentView === 'chat' && _jsx(TabBar, {}),
                _jsx('div', { className: 'flex-1 min-h-0 overflow-hidden', children: children }),
                _jsx(StatusFooter, { ...footerProps }),
              ],
            }),
          ],
        }),
      ],
    }),
  });
}
// ---------------------------------------------------------------------------
// Component (with ThemeProvider wrapper)
// ---------------------------------------------------------------------------
export function AppShell({ children }) {
  return _jsx(ThemeProvider, {
    storageKey: 'claude-hydra-theme',
    children: _jsx(AppShellInner, { children: children }),
  });
}
