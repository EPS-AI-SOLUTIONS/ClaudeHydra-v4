import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // Load ALL env vars (empty prefix = no VITE_ filter)
  const env = loadEnv(mode, process.cwd(), '');
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:8082';
  const partnerBackendUrl = env.VITE_PARTNER_BACKEND_URL || 'http://localhost:8081';

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.ANTHROPIC_API_KEY': JSON.stringify(env.ANTHROPIC_API_KEY ?? ''),
      'import.meta.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY ?? ''),
      'import.meta.env.GOOGLE_API_KEY': JSON.stringify(env.GOOGLE_API_KEY ?? ''),
      'import.meta.env.GROQ_API_KEY': JSON.stringify(env.GROQ_API_KEY ?? ''),
      'import.meta.env.MISTRAL_API_KEY': JSON.stringify(env.MISTRAL_API_KEY ?? ''),
      'import.meta.env.OPENROUTER_API_KEY': JSON.stringify(env.OPENROUTER_API_KEY ?? ''),
      'import.meta.env.TOGETHER_API_KEY': JSON.stringify(env.TOGETHER_API_KEY ?? ''),
    },
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
        '/partner-api': {
          target: partnerBackendUrl,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/partner-api/, '/api'),
        },
      },
    },
    preview: {
      port: 5199,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          secure: backendUrl.startsWith('https'),
        },
        '/partner-api': {
          target: partnerBackendUrl,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/partner-api/, '/api'),
        },
      },
    },
    build: {
      target: 'esnext',
      sourcemap: true,
    },
  };
});
