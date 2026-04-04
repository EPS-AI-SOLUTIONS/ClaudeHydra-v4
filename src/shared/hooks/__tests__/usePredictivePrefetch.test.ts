import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the queryClient and env modules before importing the hook
vi.mock('@/shared/api/queryClient', () => ({
  queryClient: {
    prefetchQuery: vi.fn(),
  },
}));

vi.mock('@/shared/config/env', () => ({
  env: {
    VITE_BACKEND_URL: 'http://localhost:8082',
  },
}));

// Must import after mocks
const { usePredictivePrefetch, dispatchViewHint } = await import('../usePredictivePrefetch');

describe('usePredictivePrefetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns prefetchOnHover and cancelHoverPrefetch functions', () => {
    const { result } = renderHook(() => usePredictivePrefetch());
    expect(typeof result.current.prefetchOnHover).toBe('function');
    expect(typeof result.current.cancelHoverPrefetch).toBe('function');
    expect(typeof result.current.prefetchView).toBe('function');
  });

  it('cancelHoverPrefetch does not throw', () => {
    const { result } = renderHook(() => usePredictivePrefetch());
    expect(() => result.current.cancelHoverPrefetch()).not.toThrow();
  });
});

describe('dispatchViewHint', () => {
  it('dispatches a custom viewhint event', () => {
    const handler = vi.fn();
    window.addEventListener('viewhint', handler);
    dispatchViewHint(['chat', 'settings']);
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener('viewhint', handler);
  });

  it('event detail contains the views array', () => {
    let detail: any = null;
    const handler = (e: Event) => {
      detail = (e as CustomEvent).detail;
    };
    window.addEventListener('viewhint', handler);
    dispatchViewHint(['analytics']);
    expect(detail).toEqual({ views: ['analytics'] });
    window.removeEventListener('viewhint', handler);
  });
});
