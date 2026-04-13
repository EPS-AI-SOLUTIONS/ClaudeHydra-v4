/**
 * ClaudeHydra — Login View
 * Tabbed auth: Google OAuth (LoginButton) + Email/password
 * Uses @jaskier/auth's AuthContext (loginWithPassword / register) directly.
 */

import { LoginButton, useAuth } from '@jaskier/auth';
import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useActionState, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AlertTriangle from '~icons/lucide/alert-triangle';
import KeyRound from '~icons/lucide/key-round';
import Loader2 from '~icons/lucide/loader-2';
import Lock from '~icons/lucide/lock';
import Mail from '~icons/lucide/mail';
import Shield from '~icons/lucide/shield';
import User from '~icons/lucide/user';

// ── Types ─────────────────────────────────────────────────────────────────────

type AuthTab = 'google' | 'email';
type Mode = 'login' | 'register';

interface CredFormState {
  error: string;
  pendingApproval: boolean;
  requires2fa: boolean;
  tempToken: string;
}

const initialCredState: CredFormState = {
  error: '',
  pendingApproval: false,
  requires2fa: false,
  tempToken: '',
};

const tabContentVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.12 } },
};

// ── AuthTabBar ────────────────────────────────────────────────────────────────

interface AuthTabBarProps {
  active: AuthTab;
  onChange: (tab: AuthTab) => void;
}

function AuthTabBar({ active, onChange }: AuthTabBarProps) {
  const { t } = useTranslation();
  const theme = useViewTheme();

  const tabs: { id: AuthTab; label: string; icon: React.ReactNode }[] = [
    { id: 'google', label: t('auth.tabGoogle'), icon: <Shield width={13} height={13} /> },
    { id: 'email', label: t('auth.tabEmail'), icon: <Mail width={13} height={13} /> },
  ];

  return (
    <div className={cn('flex rounded-lg p-0.5 gap-0.5', theme.isLight ? 'bg-black/8' : 'bg-white/8')}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-all duration-150',
            active === tab.id
              ? 'bg-[var(--matrix-accent)] text-black shadow-sm'
              : cn('hover:bg-white/10', theme.textMuted),
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Pending approval notice ───────────────────────────────────────────────────

function PendingApprovalNotice() {
  const { t } = useTranslation();
  const theme = useViewTheme();
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20"
    >
      <AlertTriangle width={14} height={14} className="text-amber-400 shrink-0 mt-0.5" />
      <p className={cn('text-xs font-mono', theme.textMuted)}>{t('auth.pendingApproval')}</p>
    </motion.div>
  );
}

// ── TOTP step ─────────────────────────────────────────────────────────────────

interface TotpStepProps {
  tempToken: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function TotpStep({ tempToken, onSuccess, onCancel }: TotpStepProps) {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const apiBase = (import.meta.env['VITE_AUTH_API_URL'] as string | undefined) ?? 'http://localhost:8086';

  const handleVerify = async () => {
    if (code.length < 6) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/api/auth/totp/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken, code }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((body as { error?: string }).error ?? t('auth.twoFaError'));
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.twoFaError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound width={14} height={14} className="text-[var(--matrix-accent)]" />
        <p className={cn('text-xs font-mono', theme.text)}>{t('auth.twoFaRequired')}</p>
      </div>

      <input
        type="text"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        placeholder="000000"
        className={cn(
          'w-full rounded-lg px-3 py-2 text-center font-mono text-lg tracking-widest',
          'bg-black/20 border border-white/10 focus:border-[var(--matrix-accent)] outline-none transition-colors',
          theme.text,
        )}
      />

      {error && (
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle width={12} height={12} />
          <span className="text-xs font-mono">{error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            'flex-1 px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors',
            theme.isLight
              ? 'border-black/10 hover:bg-black/5 text-black/70'
              : 'border-white/10 hover:bg-white/5 text-white/70',
          )}
        >
          {t('auth.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void handleVerify()}
          disabled={isLoading || code.length < 6}
          className={cn(
            'flex-1 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors',
            'bg-[var(--matrix-accent)] text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {isLoading ? <Loader2 width={12} height={12} className="animate-spin mx-auto" /> : t('auth.twoFaVerify')}
        </button>
      </div>
    </motion.div>
  );
}

// ── CredentialSection ─────────────────────────────────────────────────────────

const CredentialSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { loginWithPassword, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [totpToken, setTotpToken] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);

  const [formState, formAction, isPending] = useActionState(
    async (_prev: CredFormState, formData: FormData): Promise<CredFormState> => {
      const email = (formData.get('email') as string).trim();
      const password = formData.get('password') as string;
      const name = ((formData.get('name') as string) ?? '').trim();

      if (!email || !password) return initialCredState;

      try {
        if (mode === 'register') {
          await register(email, password, name || (email.split('@')[0] ?? email));
        } else {
          await loginWithPassword(email, password);
        }
        // On success useAuth state updates, JaskierAuthGate re-renders
        return initialCredState;
      } catch (err) {
        if (err instanceof Error) {
          if (err.message === 'account_pending_approval') {
            setPendingApproval(true);
            return { ...initialCredState, pendingApproval: true };
          }
          try {
            const parsed = JSON.parse(err.message) as { requires_2fa?: unknown; temp_token?: unknown };
            if (parsed['requires_2fa'] && typeof parsed['temp_token'] === 'string') {
              setTotpToken(parsed['temp_token']);
              return { ...initialCredState, requires2fa: true, tempToken: parsed['temp_token'] };
            }
          } catch {
            // not JSON
          }
          return { ...initialCredState, error: err.message };
        }
        return { ...initialCredState, error: t('auth.loginError') };
      }
    },
    initialCredState,
  );

  const inputClass = cn(
    'w-full rounded-lg px-3 py-2 text-sm font-mono',
    'bg-black/20 border border-white/10 focus:border-[var(--matrix-accent)] outline-none transition-colors',
    theme.isLight && 'bg-black/5 border-black/10',
    theme.text,
  );

  const labelClass = cn('block text-xs font-mono uppercase tracking-wider mb-1.5', theme.textMuted);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock width={14} height={14} className="text-[var(--matrix-accent)]" />
          <h3 className={cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text)}>
            {t('auth.titleEmail')}
          </h3>
        </div>
        <span
          className={cn(
            'text-xs font-mono px-2 py-0.5 rounded-md',
            theme.isLight ? 'bg-black/8 text-black/60' : 'bg-white/8 text-white/60',
          )}
        >
          {mode === 'login' ? t('auth.modeLogin') : t('auth.modeRegister')}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {/* ── 2FA step ── */}
        {totpToken && (
          <motion.div key="totp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <TotpStep
              tempToken={totpToken}
              onSuccess={() => setTotpToken(null)}
              onCancel={() => setTotpToken(null)}
            />
          </motion.div>
        )}

        {/* ── Pending approval ── */}
        {pendingApproval && !totpToken && (
          <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PendingApprovalNotice />
          </motion.div>
        )}

        {/* ── Main form ── */}
        {!totpToken && !pendingApproval && (
          <motion.form
            key="form"
            action={formAction}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {formState.error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle width={12} height={12} className="text-red-400 shrink-0" />
                <span className="text-xs font-mono text-red-400">{formState.error}</span>
              </div>
            )}

            {/* Name (register only) */}
            <AnimatePresence>
              {mode === 'register' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <label className={labelClass} htmlFor="ch-cred-name">
                    {t('auth.name')}
                  </label>
                  <div className="relative">
                    <User width={13} height={13} className={cn('absolute left-2.5 top-1/2 -translate-y-1/2', theme.textMuted)} />
                    <input
                      id="ch-cred-name"
                      type="text"
                      name="name"
                      className={cn(inputClass, 'pl-8')}
                      placeholder={t('auth.namePlaceholder')}
                      autoComplete="name"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <div>
              <label className={labelClass} htmlFor="ch-cred-email">
                {t('auth.email')}
              </label>
              <div className="relative">
                <Mail width={13} height={13} className={cn('absolute left-2.5 top-1/2 -translate-y-1/2', theme.textMuted)} />
                <input
                  id="ch-cred-email"
                  type="email"
                  name="email"
                  required
                  className={cn(inputClass, 'pl-8')}
                  placeholder="user@example.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className={labelClass} htmlFor="ch-cred-password">
                {t('auth.password')}
              </label>
              <div className="relative">
                <Lock width={13} height={13} className={cn('absolute left-2.5 top-1/2 -translate-y-1/2', theme.textMuted)} />
                <input
                  id="ch-cred-password"
                  type="password"
                  name="password"
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  className={cn(inputClass, 'pl-8')}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
              {mode === 'register' && (
                <p className={cn('text-xs mt-1 font-mono', theme.textMuted)}>{t('auth.passwordMin')}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-mono font-semibold transition-colors',
                'bg-[var(--matrix-accent)] text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isPending && <Loader2 width={13} height={13} className="animate-spin" />}
              {mode === 'login' ? t('auth.loginAction') : t('auth.registerAction')}
            </button>

            {/* Mode switch */}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setPendingApproval(false);
              }}
              className={cn(
                'w-full text-xs font-mono py-1 transition-colors hover:text-[var(--matrix-accent)]',
                theme.textMuted,
              )}
            >
              {mode === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin')}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
});

CredentialSection.displayName = 'ClaudeHydraCredentialSection';

// ── Main LoginView ────────────────────────────────────────────────────────────

export function ClaudeHydraLoginView() {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const [activeTab, setActiveTab] = useState<AuthTab>('google');

  return (
    <div
      className={cn(
        'relative flex h-screen w-full items-center justify-center overflow-hidden font-mono',
        theme.isLight ? 'text-black' : 'text-white',
      )}
    >
      <motion.div
        className="relative z-10 w-full max-w-md px-4"
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div
            className={cn(
              'w-16 h-16 rounded-2xl flex items-center justify-center mb-4',
              theme.isLight ? 'bg-black/5' : 'bg-white/5',
            )}
          >
            <Shield width={32} height={32} className="text-[var(--matrix-accent)]" />
          </div>
          <h1 className={cn('text-xl font-bold font-mono tracking-tight', theme.title)}>ClaudeHydra</h1>
          <p className={cn('text-xs mt-2 text-center max-w-sm', theme.textMuted)}>
            {t('auth.loginSubtitle', 'Sign in to access the AI Swarm Control Center')}
          </p>
        </div>

        {/* Tabbed auth card */}
        <div className={cn('rounded-xl border p-5 space-y-4', theme.card)}>
          <AuthTabBar active={activeTab} onChange={setActiveTab} />

          <AnimatePresence mode="wait">
            {activeTab === 'google' && (
              <motion.div key="google" {...tabContentVariants} className="flex flex-col items-center gap-3 py-2">
                <p className={cn('text-xs font-mono text-center', theme.textMuted)}>
                  {t('auth.oauthDesc', 'Sign in with your Google account for seamless access.')}
                </p>
                <LoginButton />
              </motion.div>
            )}

            {activeTab === 'email' && (
              <motion.div key="email" {...tabContentVariants}>
                <CredentialSection />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

export default ClaudeHydraLoginView;
