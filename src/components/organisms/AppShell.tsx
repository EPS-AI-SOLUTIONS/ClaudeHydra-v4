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
 * Unified with GeminiHydra-v15 AppShell pattern for StatusFooter props.
 */

import { type ReactNode, useEffect, useMemo } from 'react';

import { RuneRain, ThemedBackground } from '@/components/atoms';
import { Sidebar } from '@/components/organisms/Sidebar';
import type { StatusFooterProps } from '@/components/organisms/StatusFooter';
import { StatusFooter } from '@/components/organisms/StatusFooter';
import { TabBar } from '@/components/organisms/TabBar';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { useHealthStatus, useSystemStatsQuery } from '@/features/health/hooks/useHealth';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
import { useViewStore } from '@/stores/viewStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format raw model ID (e.g. "claude-sonnet-4-6") into a display name ("Claude Sonnet 4"). */
function formatModelName(id: string): string {
  // Strip common suffixes like date stamps (e.g. -20251001)
  let name = id.replace(/-\d{8}$/, '').replace(/-preview$/, '').replace(/-latest$/, '');
  const parts = name.split('-');
  return parts
    .map((p) => (/^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppShellProps {
  /** Page content rendered in the main area */
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Inner shell (needs ThemeProvider above it)
// ---------------------------------------------------------------------------

function AppShellInner({ children }: AppShellProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const currentView = useViewStore((s) => s.currentView);

  // Health & system stats
  const healthStatus = useHealthStatus();
  const { data: stats } = useSystemStatsQuery();
  const { data: settings } = useSettingsQuery();

  // Map health status to ConnectionHealth
  const connectionHealth = healthStatus === 'healthy' ? 'connected' as const
    : healthStatus === 'degraded' ? 'degraded' as const
    : 'disconnected' as const;

  // Resolve display model from settings
  const displayModel = useMemo(() => {
    const raw = settings?.default_model;
    return raw ? formatModelName(raw) : undefined;
  }, [settings?.default_model]);

  // Build live footer props from system stats
  const raw = stats as Record<string, number> | undefined;
  const footerProps = useMemo<StatusFooterProps>(() => ({
    connectionHealth,
    ...(displayModel && { selectedModel: displayModel }),
    ...(raw && {
      cpuUsage: Math.round(raw.cpu_usage_percent ?? raw.cpu_usage ?? 0),
      ramUsage: Math.round(
        ((raw.memory_used_mb ?? raw.memory_used ?? 0) /
          (raw.memory_total_mb ?? raw.memory_total ?? 1)) *
          100,
      ),
      statsLoaded: true,
    }),
  }), [connectionHealth, displayModel, raw]);

  const glassPanel = isDark
    ? 'bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl'
    : 'bg-white/40 backdrop-blur-xl border border-white/20 shadow-lg rounded-2xl';

  // Ctrl+T: create new tab (chat view only)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 't' && useViewStore.getState().currentView === 'chat') {
        e.preventDefault();
        useViewStore.getState().createSession();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      data-testid="app-shell"
      className={`relative flex h-screen w-full ${
        isDark
          ? 'text-white selection:bg-white/30 selection:text-white'
          : 'text-black selection:bg-emerald-500 selection:text-white'
      } overflow-hidden font-mono`}
    >
      {/* Background layers */}
      <ThemedBackground resolvedTheme={resolvedTheme} />

      {/* Rune Rain Effect */}
      <RuneRain opacity={0.1} />

      {/* Main content with padding and gap matching Tissaia */}
      <div className="relative z-10 flex h-full w-full backdrop-blur-[1px] gap-4 p-4">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content area */}
        <main className={`flex-1 flex flex-col min-w-0 overflow-hidden relative ${glassPanel}`}>
          {currentView === 'chat' && <TabBar />}
          {/* View Content — animations handled by ViewRouter */}
          <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
          <StatusFooter {...footerProps} />
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component (with ThemeProvider wrapper)
// ---------------------------------------------------------------------------

export function AppShell({ children }: AppShellProps) {
  return (
    <ThemeProvider>
      <AppShellInner>{children}</AppShellInner>
    </ThemeProvider>
  );
}
