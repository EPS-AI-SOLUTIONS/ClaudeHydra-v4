/// <reference types="vitest/config" />

/**
 * vite.config.vercel.ts — Standalone Vercel build config.
 *
 * Differences from vite.config.ts:
 *   1. No `unplugin-icons/vite` — not declared in devDependencies, unavailable on Vercel.
 *      The monorepo resolves it via workspace hoisting; standalone build uses a virtual shim.
 *   2. No `rollup-plugin-visualizer` (dev-only, analyze mode only).
 *   3. No `vite-plugin-compression` (handled by Vercel CDN / edge caching).
 *   4. `resolve.alias` shims for `~icons/lucide/*` so any remaining icon imports
 *      don't crash the bundler with "Failed to resolve ~icons/...".
 *   5. Resolves `@jaskier/*` through the shims created by scripts/create-shims.ts.
 */

import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig, loadEnv } from 'vite';

/**
 * Shim for ~icons/* virtual module imports created by unplugin-icons.
 * On Vercel we don't have the plugin, so we replace every icon import
 * with a tiny React functional component that renders null.
 */
function iconsMockPlugin(): Plugin {
  return {
    name: 'icons-mock',
    resolveId(id: string) {
      if (id.startsWith('~icons/')) return `\0icons-mock:${id}`;
      return null;
    },
    load(id: string) {
      if (id.startsWith('\0icons-mock:')) {
        return `import { createElement } from 'react';
export default function MockIcon(props) { return createElement('span', props); };
`;
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendUrl = env.VITE_BACKEND_URL || 'https://claudehydra-v4-backend.fly.dev';

  return {
    clearScreen: false,
    plugins: [
      iconsMockPlugin(),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
      dedupe: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@tanstack/react-query',
        'zustand',
        'sonner',
        'i18next',
        'react-i18next',
        'motion',
        'lucide-react',
      ],
    },
    optimizeDeps: {
      include: ['@jaskier/ui', '@jaskier/core', '@jaskier/state', '@jaskier/i18n'],
      exclude: ['@tailwindcss/oxide', 'fsevents', 'lightningcss', 'tailwindcss'],
    },
    build: {
      target: 'esnext',
      sourcemap: false,
      modulePreload: {
        polyfill: true,
      },
      rolldownOptions: {
        input: './index.html',
        external: (id: string) =>
          id.endsWith('.node') ||
          id.startsWith('/wasm/') ||
          id.includes('../pkg'),
        output: {
          manualChunks(id: string) {
            if (
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/react/') ||
              id.includes('/node_modules/scheduler/')
            ) return 'vendor-react';
            if (id.includes('/node_modules/zustand/')) return 'vendor-zustand';
            if (id.includes('/node_modules/@tanstack/react-query/') && !id.includes('devtools'))
              return 'vendor-query';
            if (id.includes('/node_modules/@tanstack/react-virtual/') ||
              id.includes('/node_modules/@tanstack/virtual-core/'))
              return 'vendor-virtual';
            if (id.includes('/node_modules/motion/')) return 'vendor-motion';
            if (id.includes('/node_modules/i18next') ||
              id.includes('/node_modules/react-i18next/'))
              return 'vendor-i18n';
            if (id.includes('/node_modules/zod/')) return 'vendor-zod';
            if (id.includes('/node_modules/lucide-react/')) return 'vendor-lucide';
            if (id.includes('/node_modules/sonner/') ||
              id.includes('/node_modules/dompurify/'))
              return 'vendor-ui';
            if (
              (id.includes('/packages/core/') && !id.includes('/telemetry')) ||
              id.includes('/packages/state/') ||
              id.includes('/packages/i18n/')
            ) return 'shared-core';
            if (
              id.includes('/packages/hydra-app/') ||
              id.includes('/packages/chat-module/') ||
              id.includes('/packages/ui/')
            ) return 'shared-ui';
            if (id.includes('MarkdownRenderer')) return 'lazy-markdown';
          },
        },
      },
    },
  };
});
