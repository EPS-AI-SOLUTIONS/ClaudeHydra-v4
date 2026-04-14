/** Jaskier Shared Pattern — OAuth PKCE status hook */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/shared/api/client';

const OAUTH_DISMISSED_KEY = 'jaskier_oauth_dismissed';
const OAUTH_QUERY_KEY = ['oauth-status'];
function readDismissed() {
  try {
    return localStorage.getItem(OAUTH_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}
function parseCallbackUrl(input) {
  try {
    const url = new URL(input.trim());
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (code && state) return { code, state };
    return null;
  } catch {
    return null;
  }
}
export function useOAuthStatus() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [localPhase, setLocalPhase] = useState('idle');
  const [isDismissed, setIsDismissed] = useState(readDismissed);
  const [authUrl, setAuthUrl] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const { data: status, isLoading } = useQuery({
    queryKey: OAUTH_QUERY_KEY,
    queryFn: () => apiGet('/api/auth/status'),
    staleTime: 60_000,
    refetchInterval: 300_000,
    retry: 1,
  });
  // Derive phase from backend status + local state
  const phase =
    status?.authenticated && !status.expired ? 'authenticated' : localPhase;
  const loginMutation = useMutation({
    mutationFn: () => apiPost('/api/auth/login'),
    onSuccess: (data) => {
      setAuthUrl(data.auth_url);
      setErrorMessage(null);
      const win = window.open(data.auth_url, '_blank', 'noopener');
      if (!win) {
        toast.info(t('oauth.popupBlocked'));
      }
      setLocalPhase('waiting_code');
    },
    onError: () => {
      setErrorMessage(t('oauth.loginError'));
      toast.error(t('oauth.loginError'));
      setLocalPhase('error');
    },
  });
  const callbackMutation = useMutation({
    mutationFn: (params) => apiPost('/api/auth/callback', params),
    onSuccess: () => {
      setLocalPhase('idle');
      setAuthUrl(null);
      setErrorMessage(null);
      qc.invalidateQueries({ queryKey: OAUTH_QUERY_KEY });
      toast.success(t('oauth.loginSuccess'));
    },
    onError: () => {
      setErrorMessage(t('oauth.loginError'));
      toast.error(t('oauth.loginError'));
      setLocalPhase('error');
    },
  });
  const logoutMutation = useMutation({
    mutationFn: () => apiPost('/api/auth/logout'),
    onSuccess: () => {
      setLocalPhase('idle');
      setAuthUrl(null);
      setErrorMessage(null);
      qc.invalidateQueries({ queryKey: OAUTH_QUERY_KEY });
      toast.success(t('oauth.logoutSuccess'));
    },
  });
  const login = useCallback(() => {
    setErrorMessage(null);
    loginMutation.mutate();
  }, [loginMutation]);
  const submitCode = useCallback(
    (callbackUrl) => {
      const parsed = parseCallbackUrl(callbackUrl);
      if (!parsed) {
        toast.error(t('oauth.invalidUrl'));
        return;
      }
      setLocalPhase('exchanging');
      callbackMutation.mutate(parsed);
    },
    [callbackMutation, t],
  );
  const logout = useCallback(() => {
    logoutMutation.mutate();
  }, [logoutMutation]);
  const cancel = useCallback(() => {
    setLocalPhase('idle');
    setAuthUrl(null);
    setErrorMessage(null);
  }, []);
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(OAUTH_DISMISSED_KEY, 'true');
    } catch {
      /* ignore */
    }
    setIsDismissed(true);
  }, []);
  return {
    status,
    isLoading,
    phase,
    isDismissed,
    dismiss,
    login,
    submitCode,
    logout,
    cancel,
    authUrl,
    errorMessage,
    isMutating:
      loginMutation.isPending ||
      callbackMutation.isPending ||
      logoutMutation.isPending,
  };
}
