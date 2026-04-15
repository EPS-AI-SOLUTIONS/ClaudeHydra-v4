/// <reference types="vitest/config" />

import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig, loadEnv } from 'vite';

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

// Vite 8 builds both client + SSR environments by default.
// ClaudeHydra is a client-only SPA — skip the SSR environment build.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    clearScreen: false,
    builder: {
      async buildApp(builder) {
        await builder.build(builder.environments.client);
      },
    },
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
        'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime',
        '@tanstack/react-query', 'zustand', 'sonner', 'i18next', 'react-i18next', 'motion', 'lucide-react',
      ],
    },
    optimizeDeps: {
      include: ['@jaskier/ui', '@jaskier/core', '@jaskier/state', '@jaskier/i18n'],
      exclude: ['@tailwindcss/oxide', 'fsevents', 'lightningcss', 'tailwindcss'],
    },
    build: {
      target: 'esnext',
      sourcemap: false,
      modulePreload: { polyfill: true },
      rollupOptions: {
        input: './index.html',
        external: (id: string) =>
          id.endsWith('.node') || id.startsWith('/wasm/') || id.includes('../pkg'),
        output: {
          manualChunks(id: string) {
            if (id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react/') || id.includes('/node_modules/scheduler/')) return 'vendor-react';
            if (id.includes('/node_modules/zustand/')) return 'vendor-zustand';
            if (id.includes('/node_modules/@tanstack/react-query/') && !id.includes('devtools')) return 'vendor-query';
            if (id.includes('/node_modules/motion/')) return 'vendor-motion';
            if (id.includes('/node_modules/i18next') || id.includes('/node_modules/react-i18next/')) return 'vendor-i18n';
            if (id.includes('/node_modules/zod/')) return 'vendor-zod';
            if (id.includes('/node_modules/lucide-react/')) return 'vendor-lucide';
            if (id.includes('/node_modules/sonner/') || id.includes('/node_modules/dompurify/')) return 'vendor-ui';
          },
        },
      },
    },
  };
});
