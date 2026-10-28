import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // In development the SPA calls /api on its own origin and Vite forwards it to Express,
  // exactly like the Vercel rewrite does in production (cookies stay first-party).
  const target = env.DEV_API_PROXY || 'http://localhost:5001';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: false },
        '/uploads': { target, changeOrigin: false },
      },
    },
    preview: { port: 4173 },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 900,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.js'],
      css: false,
    },
  };
});
