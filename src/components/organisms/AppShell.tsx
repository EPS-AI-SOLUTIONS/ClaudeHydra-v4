/**
 * AppShell — root layout organism for ClaudeHydra v4.
 * Ported from ClaudeHydra v3 App.tsx layout.
 *
 * Composes:
 *  - ThemeProvider wrapper
 *  - Background layers (RuneRain, background image, gradient, glow, vignette)
 *  - GridBackground (subtle green grid pattern)
 *  - Sidebar (collapsible navigation)
 *  - Content area (children slot)
 *
 * Matches the legacy layout with p-3 gap-3 spacing.
 */

import type { ReactNode } from 'react';

import { RuneRain, ScanLine } from '@/components/atoms';
import { Sidebar } from '@/components/organisms/Sidebar';
import { useTheme, ThemeProvider } from '@/contexts/ThemeContext';

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
  const { isDark } = useTheme();

  return (
    <div data-testid="app-shell" className="h-screen w-screen flex bg-[var(--matrix-bg-primary)] bg-grid-pattern overflow-hidden">
      {/* Background layers — fixed behind everything */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Rune Rain — falling white runes (dark mode only) */}
        {isDark && <RuneRain opacity={0.1} />}

        {/* Background image — switches per theme */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000"
          style={{
            backgroundImage: isDark
              ? 'url(/background.webp)'
              : 'url(/backgroundlight.webp)',
            opacity: isDark ? 0.3 : 0.4,
          }}
        />

        {/* Overlay gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(10,31,10,0.5), transparent, rgba(10,31,10,0.7))',
            backdropFilter: 'blur(2px)',
          }}
        />

        {/* Radial glow from center */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,65,0.04)_0%,transparent_60%)]" />

        {/* Vignette effect */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.4)_100%)]" />
      </div>

      {/* Scan-line CRT overlay */}
      <ScanLine />

      {/* Main content with padding and gap matching original */}
      <div className="relative flex w-full h-full p-3 gap-3">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-[1]">
          {children}
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
