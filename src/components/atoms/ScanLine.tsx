/**
 * ScanLine — horizontal scanning line animation (CRT monitor effect).
 * Ported from ClaudeHydra v3 `.scan-line` CSS class + `scan-line-vertical` keyframes.
 *
 * Renders a thin horizontal green bar that travels from top to bottom of its
 * container, simulating a retro CRT scan line. The animation is defined in
 * globals.css (`scan-line-vertical`). This component provides a reusable
 * atom wrapper.
 *
 * The component respects `prefers-reduced-motion` through the global CSS
 * media query that collapses all animation durations.
 *
 * In light theme the scan line is hidden (opacity 0) since the CRT effect
 * only makes sense against the dark Matrix background.
 */

import { useTheme } from '@/contexts/ThemeContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScanLineProps {
  /** Extra CSS classes appended to the element */
  className?: string;
  /**
   * Animation duration in seconds. Defaults to 4 (matching legacy).
   * A lower value makes the line sweep faster.
   */
  duration?: number;
  /**
   * Opacity of the scan line (0-1). Defaults to 0.4 (matching legacy).
   */
  opacity?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScanLine({ className = '', duration = 4, opacity = 0.4 }: ScanLineProps) {
  const { isDark } = useTheme();

  // Only show in dark mode — the CRT effect doesn't fit the light theme.
  if (!isDark) return null;

  return (
    <div
      aria-hidden="true"
      className={`scan-line pointer-events-none ${className}`}
      style={{
        animationDuration: `${duration}s`,
        opacity,
      }}
    />
  );
}
