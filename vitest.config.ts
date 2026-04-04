/// <reference types="vitest/config" />

import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Deduplicate React for all workspace packages (prevents dual-instance hooks error)
      'react': resolve(__dirname, '../../node_modules/react'),
      'react/jsx-runtime': resolve(__dirname, '../../node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': resolve(__dirname, '../../node_modules/react/jsx-dev-runtime'),
      'react-dom': resolve(__dirname, '../../node_modules/react-dom'),
      'react-dom/client': resolve(__dirname, '../../node_modules/react-dom/client'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    server: {
      deps: {
        inline: [/@jaskier\//],
      },
    },
  },
});
