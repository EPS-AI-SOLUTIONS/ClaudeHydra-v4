/**
 * TanStack Query v5 client instance for ClaudeHydra v4.
 * Shared across the entire application via QueryClientProvider.
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
