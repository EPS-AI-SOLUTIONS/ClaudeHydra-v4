import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:8082';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5199,
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
        secure: backendUrl.startsWith('https'),
      },
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
  },
});
