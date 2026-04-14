/** Jaskier Shared Pattern — Vault Status Dashboard Section */
import { useViewTheme } from '@jaskier/chat-module';
import { Badge, Button, cn, Input } from '@jaskier/ui';
import {
  resolveVaultStatus,
  VAULT_API,
  VAULT_DASHBOARD_URL,
  VAULT_POLLING,
  VAULT_QUERY_KEYS,
  VAULT_STATUS_CONFIG,
} from '@jaskier/vault-client';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useMemo, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/shared/api/client';
import ChevronDown from '~icons/lucide/chevron-down';
import ChevronRight from '~icons/lucide/chevron-right';
import ExternalLink from '~icons/lucide/external-link';
import KeyRound from '~icons/lucide/key-round';
import Lock from '~icons/lucide/lock';
import Mountain from '~icons/lucide/mountain';
import RefreshCw from '~icons/lucide/refresh-cw';
import Server from '~icons/lucide/server';
import Shield from '~icons/lucide/shield';
import ShieldAlert from '~icons/lucide/shield-alert';
import Trash2 from '~icons/lucide/trash-2';

function formatTimestamp(iso) {
  try {
    return new Date(iso).toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}
const collapseVariants = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1, transition: { duration: 0.2 } },
  exit: { height: 0, opacity: 0, transition: { duration: 0.15 } },
};
// ── Component ──────────────────────────────────────────────────────────
export default function VaultStatusSection() {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const [namespacesOpen, setNamespacesOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [panicInput, setPanicInput] = useState('');
  const [panicLoading, setPanicLoading] = useState(false);
  const [rotateLoading, setRotateLoading] = useState(false);
  // ── Data fetching ──
  const { data: vaultHealth } = useQuery({
    queryKey: [...VAULT_QUERY_KEYS.health],
    queryFn: () => apiGet(VAULT_API.health),
    refetchInterval: VAULT_POLLING.health,
  });
  const { data: auditEntries } = useQuery({
    queryKey: [...VAULT_QUERY_KEYS.audit],
    queryFn: () => apiGet(`${VAULT_API.audit}?limit=5`),
    refetchInterval: VAULT_POLLING.audit,
  });
  const { data: namespaces } = useQuery({
    queryKey: [...VAULT_QUERY_KEYS.namespaces],
    queryFn: () => apiGet(VAULT_API.namespaces),
    refetchInterval: VAULT_POLLING.namespaces,
    enabled: namespacesOpen,
  });
  // ── Derived state ──
  const status = useMemo(
    () => resolveVaultStatus(vaultHealth ?? null),
    [vaultHealth],
  );
  const statusCfg = VAULT_STATUS_CONFIG[status];
  // ── Handlers ──
  const handlePanic = useCallback(async () => {
    if (panicInput !== 'PANIC') return;
    setPanicLoading(true);
    try {
      await apiPost(VAULT_API.panic, {});
      toast.success(t('settings.vault.panicSuccess', 'Vault destroyed'));
      setPanicInput('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Panic failed');
    } finally {
      setPanicLoading(false);
    }
  }, [panicInput, t]);
  const handleRotate = useCallback(async () => {
    setRotateLoading(true);
    try {
      await apiPost(VAULT_API.rotate, {});
      toast.success(t('settings.vault.rotateSuccess', 'Credentials rotated'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rotation failed');
    } finally {
      setRotateLoading(false);
    }
  }, [t]);
  // ── Render ──
  return _jsxs('div', {
    className: 'space-y-5',
    children: [
      _jsxs('div', {
        className: 'flex items-center justify-between',
        children: [
          _jsxs('div', {
            className: 'flex items-center gap-2',
            children: [
              _jsx(Mountain, {
                width: 18,
                height: 18,
                className: 'text-[var(--matrix-accent)]',
              }),
              _jsxs('div', {
                children: [
                  _jsx('h3', {
                    className: cn(
                      'text-sm font-semibold font-mono uppercase tracking-wider',
                      theme.text,
                    ),
                    children: t('settings.vault.title', 'Skarbiec Krasnali'),
                  }),
                  _jsx('p', {
                    className: cn('text-[10px] font-mono', theme.textMuted),
                    children: 'Jaskier Vault \u2014 The Sentinel',
                  }),
                ],
              }),
            ],
          }),
          _jsxs('div', {
            className: 'flex items-center gap-2',
            children: [
              _jsx('span', {
                className: cn(
                  'w-2.5 h-2.5 rounded-full',
                  statusCfg.color,
                  statusCfg.pulseClass,
                ),
              }),
              _jsx('span', {
                className: cn('text-xs font-mono font-semibold', theme.text),
                children: statusCfg.label,
              }),
            ],
          }),
        ],
      }),
      _jsxs('div', {
        className: 'grid grid-cols-2 sm:grid-cols-4 gap-3',
        children: [
          _jsx(StatCard, {
            theme: theme,
            label: t('settings.vault.credentialCount', 'Credentials'),
            value: vaultHealth?.credential_count ?? '—',
            icon: _jsx(KeyRound, { width: 14, height: 14 }),
          }),
          _jsx(StatCard, {
            theme: theme,
            label: t('settings.vault.namespaceCount', 'Namespaces'),
            value: vaultHealth?.namespace_count ?? '—',
            icon: _jsx(Server, { width: 14, height: 14 }),
          }),
          _jsx(StatCard, {
            theme: theme,
            label: t('settings.vault.lastAudit', 'Last Audit'),
            value: vaultHealth?.last_audit
              ? formatTimestamp(vaultHealth.last_audit)
              : '—',
            icon: _jsx(Shield, { width: 14, height: 14 }),
            small: true,
          }),
          _jsx(StatCard, {
            theme: theme,
            label: t('settings.vault.encryption', 'Encryption'),
            value: vaultHealth?.encryption ?? 'AES-256-GCM',
            icon: _jsx(Lock, { width: 14, height: 14 }),
            badge: true,
          }),
        ],
      }),
      _jsxs('div', {
        className: 'grid grid-cols-3 gap-3',
        children: [
          _jsx(StatCard, {
            theme: theme,
            label: t('settings.vault.activeTickets', 'Bilety JIT'),
            value: vaultHealth?.active_tickets ?? 0,
            icon: _jsx(Shield, { width: 14, height: 14 }),
          }),
          _jsx(StatCard, {
            theme: theme,
            label: t('settings.vault.rotationServices', 'Auto-rotacja'),
            value: vaultHealth?.rotation_services ?? 0,
            icon: _jsx(RefreshCw, { width: 14, height: 14 }),
          }),
          _jsx(StatCard, {
            theme: theme,
            label: 'ACL',
            value: vaultHealth?.acl_enabled ? 'ON' : 'OFF',
            icon: _jsx(ShieldAlert, { width: 14, height: 14 }),
            badge: true,
          }),
        ],
      }),
      _jsxs('div', {
        children: [
          _jsxs('button', {
            type: 'button',
            onClick: () => setNamespacesOpen((p) => !p),
            className: cn(
              'flex items-center gap-2 w-full text-left py-1.5',
              'text-xs font-mono font-semibold uppercase tracking-wider',
              theme.text,
              'hover:text-[var(--matrix-accent)] transition-colors',
            ),
            children: [
              namespacesOpen
                ? _jsx(ChevronDown, { width: 14, height: 14 })
                : _jsx(ChevronRight, { width: 14, height: 14 }),
              t('settings.vault.namespaces', 'Namespace Browser'),
            ],
          }),
          _jsx(AnimatePresence, {
            children:
              namespacesOpen &&
              _jsx(
                motion.div,
                {
                  ...collapseVariants,
                  className: 'overflow-hidden',
                  children: _jsx('div', {
                    className: 'space-y-3 pt-2',
                    children:
                      namespaces && namespaces.length > 0
                        ? namespaces.map((ns) =>
                            _jsx(
                              NamespaceRow,
                              { ns: ns, theme: theme },
                              ns.name,
                            ),
                          )
                        : _jsx('p', {
                            className: cn('text-xs font-mono', theme.textMuted),
                            children: t(
                              'settings.vault.noNamespaces',
                              'No namespaces available',
                            ),
                          }),
                  }),
                },
                'ns-list',
              ),
          }),
        ],
      }),
      _jsxs('div', {
        className: 'space-y-2',
        children: [
          _jsx('h4', {
            className: cn(
              'text-xs font-mono font-semibold uppercase tracking-wider',
              theme.text,
            ),
            children: t('settings.vault.recentAudit', 'Recent Audit Log'),
          }),
          auditEntries && auditEntries.length > 0
            ? _jsx('div', {
                className: 'space-y-1',
                children: auditEntries.map((entry) =>
                  _jsx(
                    AuditRow,
                    { entry: entry, theme: theme },
                    `${entry.timestamp}-${entry.action}-${entry.service}`,
                  ),
                ),
              })
            : _jsx('p', {
                className: cn('text-xs font-mono', theme.textMuted),
                children: t(
                  'settings.vault.noAudit',
                  'No recent audit entries',
                ),
              }),
        ],
      }),
      _jsxs('div', {
        className: cn(
          'border rounded-lg',
          emergencyOpen ? 'border-red-500/50' : 'border-red-500/20',
        ),
        children: [
          _jsxs('button', {
            type: 'button',
            onClick: () => setEmergencyOpen((p) => !p),
            className: cn(
              'flex items-center gap-2 w-full text-left px-3 py-2',
              'text-xs font-mono font-semibold uppercase tracking-wider',
              'text-red-400 hover:text-red-300 transition-colors',
            ),
            children: [
              _jsx(ShieldAlert, { width: 14, height: 14 }),
              emergencyOpen
                ? _jsx(ChevronDown, { width: 12, height: 12 })
                : _jsx(ChevronRight, { width: 12, height: 12 }),
              t('settings.vault.emergency', 'Emergency Controls'),
            ],
          }),
          _jsx(AnimatePresence, {
            children:
              emergencyOpen &&
              _jsx(
                motion.div,
                {
                  ...collapseVariants,
                  className: 'overflow-hidden',
                  children: _jsxs('div', {
                    className: 'px-3 pb-3 space-y-4',
                    children: [
                      _jsx('p', {
                        className: 'text-xs text-red-400/80 font-mono',
                        children: t(
                          'settings.vault.emergencyWarning',
                          'Te akcje sa nieodwracalne. Uzyj tylko w sytuacji naruszenia bezpieczenstwa.',
                        ),
                      }),
                      _jsxs('div', {
                        className: 'space-y-2',
                        children: [
                          _jsxs('div', {
                            className: 'flex items-center gap-2',
                            children: [
                              _jsx(Trash2, {
                                width: 14,
                                height: 14,
                                className: 'text-red-400',
                              }),
                              _jsx('span', {
                                className: cn(
                                  'text-xs font-mono font-semibold',
                                  theme.text,
                                ),
                                children: 'Vault Panic',
                              }),
                            ],
                          }),
                          _jsx('p', {
                            className: cn(
                              'text-[10px] font-mono',
                              theme.textMuted,
                            ),
                            children: t(
                              'settings.vault.panicDesc',
                              'Destroys all credentials. Type PANIC to confirm.',
                            ),
                          }),
                          _jsxs('div', {
                            className: 'flex items-center gap-2',
                            children: [
                              _jsx(Input, {
                                value: panicInput,
                                onChange: (e) => setPanicInput(e.target.value),
                                placeholder: 'PANIC',
                                className: 'max-w-[120px] text-xs font-mono',
                              }),
                              _jsx(Button, {
                                variant: 'danger',
                                size: 'sm',
                                leftIcon: _jsx(Trash2, {
                                  width: 12,
                                  height: 12,
                                }),
                                onClick: handlePanic,
                                disabled:
                                  panicInput !== 'PANIC' || panicLoading,
                                isLoading: panicLoading,
                                children: t(
                                  'settings.vault.panicButton',
                                  'Destroy Vault',
                                ),
                              }),
                            ],
                          }),
                        ],
                      }),
                      _jsxs('div', {
                        className: 'space-y-2',
                        children: [
                          _jsxs('div', {
                            className: 'flex items-center gap-2',
                            children: [
                              _jsx(RefreshCw, {
                                width: 14,
                                height: 14,
                                className: 'text-amber-400',
                              }),
                              _jsx('span', {
                                className: cn(
                                  'text-xs font-mono font-semibold',
                                  theme.text,
                                ),
                                children: t(
                                  'settings.vault.rotateTitle',
                                  'Rotate All Credentials',
                                ),
                              }),
                            ],
                          }),
                          _jsx('p', {
                            className: cn(
                              'text-[10px] font-mono',
                              theme.textMuted,
                            ),
                            children: t(
                              'settings.vault.rotateDesc',
                              'Triggers credential rotation for all providers.',
                            ),
                          }),
                          _jsx(Button, {
                            variant: 'ghost',
                            size: 'sm',
                            leftIcon: _jsx(RefreshCw, {
                              width: 12,
                              height: 12,
                            }),
                            onClick: handleRotate,
                            isLoading: rotateLoading,
                            children: t(
                              'settings.vault.rotateButton',
                              'Rotate All',
                            ),
                          }),
                        ],
                      }),
                    ],
                  }),
                },
                'emergency',
              ),
          }),
        ],
      }),
      _jsxs('a', {
        href: VAULT_DASHBOARD_URL,
        target: '_blank',
        rel: 'noopener noreferrer',
        className: cn(
          'inline-flex items-center gap-1.5 text-xs font-mono',
          'text-[var(--matrix-accent)] hover:underline',
        ),
        children: [
          _jsx(ExternalLink, { width: 12, height: 12 }),
          t('settings.vault.openDashboard', 'Otworz pelny dashboard Vault'),
          ' ',
          '\u2192',
        ],
      }),
    ],
  });
}
const StatCard = memo(({ theme, label, value, icon, small, badge }) =>
  _jsxs('div', {
    className: cn(
      'rounded-lg p-2.5 bg-[var(--matrix-glass)] border border-white/5',
    ),
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-1.5 mb-1',
        children: [
          _jsx('span', {
            className: 'text-[var(--matrix-accent)]',
            children: icon,
          }),
          _jsx('span', {
            className: cn(
              'text-[10px] font-mono uppercase tracking-wider',
              theme.textMuted,
            ),
            children: label,
          }),
        ],
      }),
      badge
        ? _jsx(Badge, { variant: 'accent', size: 'sm', children: value })
        : _jsx('span', {
            className: cn(
              'font-mono font-bold',
              small ? 'text-xs' : 'text-lg',
              theme.text,
            ),
            children: value,
          }),
    ],
  }),
);
StatCard.displayName = 'StatCard';
const NamespaceRow = memo(({ ns, theme }) =>
  _jsxs('div', {
    className: 'space-y-1',
    children: [
      _jsx('span', {
        className: cn('text-xs font-mono font-semibold', theme.text),
        children: ns.name,
      }),
      _jsx('div', {
        className: 'flex flex-wrap gap-2 pl-2',
        children: ns.services.map((svc) =>
          _jsxs(
            'div',
            {
              className: 'flex items-center gap-1.5',
              children: [
                _jsx('span', {
                  className: cn(
                    'w-1.5 h-1.5 rounded-full',
                    svc.connected ? 'bg-emerald-500' : 'bg-red-500/60',
                  ),
                }),
                _jsx('span', {
                  className: cn('text-[10px] font-mono', theme.textMuted),
                  children: svc.name,
                }),
              ],
            },
            svc.name,
          ),
        ),
      }),
    ],
  }),
);
NamespaceRow.displayName = 'NamespaceRow';
const AuditRow = memo(({ entry, theme }) =>
  _jsxs('div', {
    className: cn(
      'flex items-center gap-3 px-2 py-1 rounded text-[10px] font-mono',
      'bg-[var(--matrix-glass)] border border-white/5',
    ),
    children: [
      _jsx('span', {
        className: cn('min-w-[100px]', theme.textMuted),
        children: formatTimestamp(entry.timestamp),
      }),
      _jsx(Badge, {
        variant: entry.action === 'DELEGATE' ? 'accent' : 'default',
        size: 'sm',
        children: entry.action,
      }),
      entry.agent &&
        entry.agent !== 'unknown' &&
        _jsx('span', {
          className: 'text-[9px] text-blue-400/80',
          children: entry.agent,
        }),
      _jsxs('span', {
        className: cn('flex-1 truncate', theme.text),
        children: [entry.namespace, '/', entry.service],
      }),
      _jsx('span', {
        className: cn(
          'text-[9px] font-semibold uppercase',
          entry.result === 'success' ? 'text-emerald-400' : 'text-red-400',
        ),
        children: entry.result,
      }),
    ],
  }),
);
AuditRow.displayName = 'AuditRow';
