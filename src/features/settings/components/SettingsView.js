/** Jaskier Shared Pattern — Settings View */
import { useViewTheme } from '@jaskier/chat-module';
import { Card, cn } from '@jaskier/ui';
import { motion } from 'motion/react';
import { memo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import Settings from '~icons/lucide/settings';
import AiProvidersSection from './AiProvidersSection';
import { AutoUpdaterSection } from './AutoUpdaterSection';
import { BrowserProxySection } from './BrowserProxySection';
import { CompactionSection } from './CompactionSection';
import { CompletionSoundSection } from './CompletionSoundSection';
import { CustomInstructionsSection } from './CustomInstructionsSection';
import { MaxIterationsSection } from './MaxIterationsSection';
import { MaxTokensSection } from './MaxTokensSection';
import { McpServersSection } from './McpServersSection';
import { TelemetrySection } from './TelemetrySection';
import { TemperatureSection } from './TemperatureSection';
import VaultStatusSection from './VaultStatusSection';
import { WasmEdgePanel } from './WasmEdgePanel';
import { WatchdogHistory } from './WatchdogHistory';
import { WorkingFolderSection } from './WorkingFolderSection';
export const SettingsView = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  return _jsx('div', {
    'data-testid': 'settings-view',
    className: 'h-full flex flex-col items-center p-8 overflow-y-auto',
    children: _jsxs(motion.div, {
      className: 'w-full max-w-2xl space-y-6',
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, ease: 'easeOut' },
      children: [
        _jsxs('div', {
          className: 'flex items-center gap-3',
          children: [
            _jsx(Settings, {
              width: 22,
              height: 22,
              className: 'text-[var(--matrix-accent)]',
            }),
            _jsx('h1', {
              className: cn(
                'text-2xl font-bold font-mono tracking-tight',
                theme.title,
              ),
              children: t('settings.title', 'Settings'),
            }),
          ],
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(AiProvidersSection, {}),
          }),
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(VaultStatusSection, {}),
          }),
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(WasmEdgePanel, {}),
          }),
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(WorkingFolderSection, {}),
          }),
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(CustomInstructionsSection, {}),
          }),
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(TemperatureSection, {}),
          }),
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(MaxTokensSection, {}),
          }),
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(MaxIterationsSection, {}),
          }),
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(CompactionSection, {}),
          }),
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(CompletionSoundSection, {}),
          }),
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(AutoUpdaterSection, {}),
          }),
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(TelemetrySection, {}),
          }),
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(BrowserProxySection, {}),
          }),
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(WatchdogHistory, {}),
          }),
        }),
        _jsx(Card, {
          children: _jsx('div', {
            className: 'p-6',
            children: _jsx(McpServersSection, {}),
          }),
        }),
      ],
    }),
  });
});
SettingsView.displayName = 'SettingsView';
export default SettingsView;
