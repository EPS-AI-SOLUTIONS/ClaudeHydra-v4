/**
 * ClaudeHydra — Google Auth status hook.
 * Thin wrapper around @jaskier/core useAuthStatus with CH-specific Google OAuth paths.
 */
import { useAuthStatus } from '@jaskier/core';
import { apiDelete, apiGet, apiPost } from '@/shared/api/client';

const GOOGLE_AUTH_CONFIG = {
  paths: {
    status: '/api/auth/google/status',
    login: '/api/auth/google/login',
    logout: '/api/auth/google/logout',
    apikey: '/api/auth/google/apikey',
  },
  i18nPrefix: 'googleAuth',
  queryKey: ['google-auth-status'],
  dismissedKey: 'jaskier_google_auth_dismissed',
  apiClient: { apiGet, apiPost, apiDelete },
};
export function useGoogleAuthStatus() {
  const result = useAuthStatus(GOOGLE_AUTH_CONFIG);
  return {
    ...result,
    // Cast to strongly-typed GoogleAuthStatus for CH consumers
    status: result.status,
  };
}
