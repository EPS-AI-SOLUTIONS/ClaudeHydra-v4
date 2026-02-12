/**
 * useViewTheme — returns theme-aware CSS class mappings
 * Ported from ClaudeHydra v3 inline theme class logic.
 *
 * ClaudeHydra's Matrix Green theme uses unique green-tinted class
 * combinations that differ from other Jaskier apps. This hook
 * centralises those mappings so components stay clean.
 */

import { useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViewThemeClasses {
  /** Root background: e.g. 'bg-matrix-bg-primary' */
  bg: string;
  /** Secondary background */
  bgSecondary: string;
  /** Tertiary background */
  bgTertiary: string;
  /** Primary text colour */
  text: string;
  /** Secondary / dim text */
  textSecondary: string;
  /** Accent colour class */
  accent: string;
  /** Border colour */
  border: string;
  /** Glass panel CSS class name */
  glassPanel: string;
  /** Glass card CSS class name */
  glassCard: string;
  /** Glass input CSS class name */
  glassInput: string;
  /** Hover background for interactive items */
  hoverBg: string;
  /** Active / selected background for nav items */
  activeBg: string;
  /** Active text colour */
  activeText: string;
  /** Scrollbar accent tint */
  scrollbarColor: string;
  /** Whether the current theme is dark */
  isDark: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useViewTheme(): ViewThemeClasses {
  const { resolvedTheme, isDark } = useTheme();

  return useMemo<ViewThemeClasses>(() => {
    if (resolvedTheme === 'dark') {
      return {
        bg: 'bg-[var(--matrix-bg-primary)]',
        bgSecondary: 'bg-[var(--matrix-bg-secondary)]',
        bgTertiary: 'bg-[var(--matrix-bg-tertiary)]',
        text: 'text-[var(--matrix-text-primary)]',
        textSecondary: 'text-[var(--matrix-text-secondary)]',
        accent: 'text-[var(--matrix-accent)]',
        border: 'border-[var(--matrix-border)]',
        glassPanel: 'glass-panel',
        glassCard: 'glass-card',
        glassInput: 'glass-input',
        hoverBg: 'hover:bg-[rgba(0,255,65,0.08)]',
        activeBg: 'bg-[var(--matrix-accent)]',
        activeText: 'text-[var(--matrix-bg-primary)]',
        scrollbarColor: 'rgba(0, 255, 65, 0.4)',
        isDark: true,
      };
    }

    // Light theme — "White Wolf" with forest green
    return {
      bg: 'bg-[var(--matrix-bg-primary)]',
      bgSecondary: 'bg-[var(--matrix-bg-secondary)]',
      bgTertiary: 'bg-[var(--matrix-bg-tertiary)]',
      text: 'text-[var(--matrix-text-primary)]',
      textSecondary: 'text-[var(--matrix-text-secondary)]',
      accent: 'text-[var(--matrix-accent)]',
      border: 'border-[var(--matrix-border)]',
      glassPanel: 'glass-panel',
      glassCard: 'glass-card',
      glassInput: 'glass-input',
      hoverBg: 'hover:bg-[rgba(45,106,79,0.08)]',
      activeBg: 'bg-[var(--matrix-accent)]',
      activeText: 'text-white',
      scrollbarColor: 'rgba(45, 106, 79, 0.4)',
      isDark: false,
    };
  }, [resolvedTheme, isDark]);
}
