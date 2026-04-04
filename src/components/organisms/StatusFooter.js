// src/components/organisms/StatusFooter.tsx
/** Jaskier Design System */
/**
 * StatusFooter - Compact status bar
 * ==================================
 * Displays: version, connection status, model tier, CPU%, RAM%,
 * tagline, and live time.
 * Unified with GeminiHydra StatusFooter layout.
 *
 * Uses `memo()` for render optimization.
 */
import { cn } from '@jaskier/ui';
import { Cloud, Cpu, Zap } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { StatusIndicator } from '@/components/molecules/StatusIndicator';
import { useTheme } from '@/contexts/ThemeContext';
import { useBrowserProxyStatus } from '@/features/settings/hooks/useBrowserProxy';

function getProxyState(status) {
  if (status.health?.ready) return 'ready';
  if (status.reachable) return 'starting';
  return 'offline';
}
const proxyDotColor = {
  ready: 'bg-emerald-500',
  starting: 'bg-amber-500',
  offline: 'bg-red-500',
};
const proxyLabelKey = {
  ready: 'footer.proxyReady',
  starting: 'footer.proxyStarting',
  offline: 'footer.proxyOffline',
};
function BrowserProxyBadge({ status }) {
  const { t } = useTranslation();
  const state = getProxyState(status);
  const h = status.health;
  const shouldPulse = state === 'ready' && (h?.workers_busy ?? 0) > 0;
  const tooltipLines = h
    ? [
        `Workers: ${String(h.workers_ready)}/${String(h.pool_size)} ready`,
        `Busy: ${String(h.workers_busy)}`,
        `Queue: ${String(h.queue_length)}`,
        `Requests: ${String(h.total_requests)}`,
        `Errors: ${String(h.total_errors)}`,
        ...(status.error ? [`Error: ${status.error}`] : []),
      ]
    : [`Status: ${state}`, ...(status.error ? [`Error: ${status.error}`] : [])];
  return _jsxs('div', {
    className: 'inline-flex items-center gap-1.5 cursor-default',
    title: tooltipLines.join('\n'),
    children: [
      _jsxs('span', {
        className: 'relative flex items-center justify-center',
        children: [
          _jsx('span', { className: cn('h-1.5 w-1.5 rounded-full shrink-0', proxyDotColor[state]) }),
          shouldPulse &&
            _jsx('span', {
              className: cn('absolute h-1.5 w-1.5 rounded-full animate-ping opacity-75', proxyDotColor[state]),
            }),
        ],
      }),
      _jsx('span', {
        className: 'text-[10px] font-mono leading-none text-inherit opacity-70',
        children: t(proxyLabelKey[state]),
      }),
    ],
  });
}
// ============================================================================
// COMPONENT
// ============================================================================
function StatusFooterComponent({
  connectionHealth = 'connected',
  selectedModel = 'Claude Sonnet 4',
  cpuUsage = 12,
  ramUsage = 45,
  tagline,
  statsLoaded = true,
}) {
  const { t } = useTranslation();
  const resolvedTagline = tagline ?? t('footer.statusTagline', 'AI Swarm Control Center');
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const { data: proxyStatus } = useBrowserProxyStatus(true);
  // Live time
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  );
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('pl-PL', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  // Connection status mapping
  const healthMap = {
    connected: { status: 'online', label: 'Online' },
    degraded: { status: 'pending', label: 'Degraded' },
    disconnected: { status: 'offline', label: 'Offline' },
  };
  const health = healthMap[connectionHealth];
  // Detect model tier (adapted for Claude models)
  const modelLower = selectedModel.toLowerCase();
  const modelTier = (() => {
    if (modelLower.includes('opus') || modelLower.includes('pro')) {
      return { label: 'PRO', icon: Cloud, cls: isLight ? 'text-blue-600' : 'text-blue-400' };
    }
    if (modelLower.includes('sonnet') || modelLower.includes('flash')) {
      return { label: 'FLASH', icon: Zap, cls: isLight ? 'text-amber-600' : 'text-amber-400' };
    }
    if (modelLower.includes('haiku') || modelLower.includes('qwen') || modelLower.includes('llama')) {
      return { label: 'LOCAL', icon: Cpu, cls: isLight ? 'text-emerald-600' : 'text-emerald-400' };
    }
    return null;
  })();
  // CPU color based on usage
  const cpuColor =
    cpuUsage > 80 ? 'text-red-400' : cpuUsage > 50 ? 'text-yellow-400' : isLight ? 'text-sky-600' : 'text-sky-400';
  // RAM color based on usage
  const ramColor =
    ramUsage > 85
      ? 'text-red-400'
      : ramUsage > 65
        ? 'text-yellow-400'
        : isLight
          ? 'text-violet-600'
          : 'text-violet-400';
  const dividerCls = isLight ? 'text-slate-300' : 'text-white/30';
  return _jsxs('footer', {
    'data-testid': 'status-footer',
    className: cn(
      'px-6 py-2.5 border-t text-sm flex items-center justify-between shrink-0 transition-all duration-500',
      isLight ? 'border-slate-200/30 bg-white/40 text-slate-600' : 'border-white/10 bg-black/20 text-slate-300',
    ),
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-4',
        children: [
          _jsx('span', { className: isLight ? 'text-emerald-600' : 'text-white', children: 'v4.0.0' }),
          _jsx('span', { className: dividerCls, children: '|' }),
          _jsx(StatusIndicator, { status: health.status, size: 'sm', label: health.label }),
          statsLoaded &&
            _jsxs(_Fragment, {
              children: [
                _jsx('span', { className: dividerCls, children: '|' }),
                _jsxs('span', {
                  className: cn('font-semibold', cpuColor),
                  title: `CPU: ${cpuUsage}%`,
                  children: ['CPU ', cpuUsage, '%'],
                }),
                _jsxs('span', {
                  className: cn('font-semibold', ramColor),
                  title: `RAM: ${ramUsage}%`,
                  children: ['RAM ', ramUsage, '%'],
                }),
              ],
            }),
          proxyStatus?.configured &&
            _jsxs(_Fragment, {
              children: [
                _jsx('span', { className: dividerCls, children: '|' }),
                _jsx(BrowserProxyBadge, { status: proxyStatus }),
              ],
            }),
        ],
      }),
      _jsxs('div', {
        className: 'flex items-center gap-4',
        children: [
          modelTier &&
            _jsxs('div', {
              className: cn('flex items-center gap-1', modelTier.cls),
              children: [
                _jsx(modelTier.icon, { size: 10, 'aria-hidden': 'true' }),
                _jsx('span', { className: 'font-bold', children: modelTier.label }),
              ],
            }),
          _jsx('span', { className: isLight ? 'text-slate-700' : 'text-white/50', children: selectedModel }),
          _jsx('span', { className: dividerCls, children: '|' }),
          _jsx('span', { title: t('footer.statusTagline', 'AI Swarm Control Center'), children: resolvedTagline }),
          _jsx('span', { className: dividerCls, children: '|' }),
          _jsx('span', {
            children: new Date().toLocaleDateString('pl-PL', {
              weekday: 'short',
              day: 'numeric',
              month: '2-digit',
              year: 'numeric',
            }),
          }),
          _jsx('span', { className: dividerCls, children: '|' }),
          _jsx('span', {
            className: cn('font-mono font-semibold tabular-nums', isLight ? 'text-emerald-600' : 'text-white'),
            children: currentTime,
          }),
        ],
      }),
    ],
  });
}
export const StatusFooter = memo(StatusFooterComponent);
StatusFooter.displayName = 'StatusFooter';
