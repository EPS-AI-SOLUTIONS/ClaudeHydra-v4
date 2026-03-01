import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Reactive hook that returns true when the viewport width is below the mobile breakpoint (768px).
 * Uses matchMedia for efficient change detection without resize polling.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
