/**
 * AppShell — root layout organism for ClaudeHydra v4.
 * Ported from ClaudeHydra v3 `web/src/components/AppShell.tsx` + `layout.tsx`.
 *
 * Composes:
 *  - ThemeProvider wrapper
 *  - GridBackground (subtle green grid pattern)
 *  - ScanLine (CRT sweep animation — dark mode only)
 *  - Sidebar (collapsible navigation)
 *  - Content area (children slot)
 *
 * Matches the legacy two-column layout: `flex h-screen overflow-hidden`.
 */

import type { ReactNode } from 'react';

import { GridBackground, ScanLine } from '@/components/atoms';
import { Sidebar } from '@/components/organisms/Sidebar';
import { ThemeProvider } from '@/contexts/ThemeContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppShellProps {
  /** Page content rendered in the main area */
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppShell({ children }: AppShellProps) {
  return (
    <ThemeProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--matrix-bg-primary)] relative">
        {/* Grid background — fixed behind everything */}
        <GridBackground fixed className="h-full w-full" />

        {/* Scan-line CRT overlay */}
        <ScanLine />

        {/* Sidebar */}
        <Sidebar />

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto relative z-[1]">{children}</main>
      </div>
    </ThemeProvider>
  );
}
