/**
 * GridBackground — subtle grid overlay for the Matrix theme.
 * Ported from ClaudeHydra v3 `.bg-grid-pattern` CSS class.
 *
 * Renders a full-viewport (or container-filling) overlay with
 * the green grid lines. The CSS class `bg-grid-pattern` is
 * already defined in globals.css — this component merely wraps
 * it into a reusable atom with optional children passthrough.
 */

import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GridBackgroundProps {
  /** Extra CSS classes appended to the root element */
  className?: string;
  /** Content rendered on top of the grid */
  children?: ReactNode;
  /**
   * When true, the grid covers the entire viewport as a fixed layer.
   * When false (default), the grid fills the nearest positioned parent.
   */
  fixed?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GridBackground({ className = '', children, fixed = false }: GridBackgroundProps) {
  const positionClass = fixed ? 'fixed' : 'absolute';

  return (
    <div className={`relative ${className}`}>
      {/* Grid overlay layer */}
      <div aria-hidden="true" className={`${positionClass} inset-0 bg-grid-pattern pointer-events-none z-0`} />
      {/* Content above the grid */}
      {children && <div className="relative z-[1]">{children}</div>}
    </div>
  );
}
