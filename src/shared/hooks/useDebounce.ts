/** Jaskier Shared Pattern */
import { useEffect, useRef, useState } from 'react';

/**
 * useDebounce — Debounces a value with optional leading edge (#36).
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default 300)
 * @param options - { leading: true } emits the first value immediately
 */
export function useDebounce<T>(value: T, delay: number = 300, options?: { leading?: boolean }): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const isFirstRef = useRef(true);

  useEffect(() => {
    // Leading edge: emit immediately on first change
    if (options?.leading && isFirstRef.current) {
      isFirstRef.current = false;
      setDebouncedValue(value);
      return;
    }
    isFirstRef.current = false;

    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay, options?.leading]);

  return debouncedValue;
}
